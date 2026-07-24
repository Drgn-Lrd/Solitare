/*
    Written by: Johnathon Largent
    Last Updated v2.2

   Added opts.sequential — instead of a fixed time-based stagger
   between cards, each next card only launches once the previous one
   has actually bounced off the floor for the first time (an
   onFirstBounce callback fired from inside spawnCascadeCard's own
   frame loop), matching the classic Solitaire cascade exactly rather
   than approximating its timing with a guessed delay.
 */
/*
     Written by: Johnathon Largent
    Last Updated 23 July 2026 @ 1645 EDT

   fitBoard now takes an optional opts.extraRows so a game can tell it
   about a row that needs more width per card than the tableau does —
   fixes FreeCell's mobile-portrait overflow (free cells + king slot +
   foundations row was wider than the tableau row, but width was only
   ever solved for the tableau's column count).
 */
/* =========================================================================
   SOLITAIRE ENGINE (shared across Klondike, FreeCell, and future games)
   =========================================================================
   This file owns everything that ISN'T specific to one game's rules:
     - card assets (filenames, loading, the corner-index fallback)
     - building a card's DOM element
     - preloading every image up front
     - solving card size to fit the screen without scrolling
     - the whole drag-and-drop + click-to-move interaction pipeline,
       including the misclick-into-a-run forgiveness and the
       hover/drag highlight system
     - a generic undo stack
     - toast messages + the hint "pulse" glow
     - the Settings modal shell (card back picker + timer/score toggles)
     - the win cascade animation

   A game file (klondike.html, freecell.html, ...) is expected to:
     1. Load this file: <script src="engine.js"></script>
     2. Own its OWN game state (piles, rules, scoring) — this file never
        touches a game's state directly, only through the callback
        functions the game hands it in a config object.
     3. Call SEngine.initInteractions(config) once, passing functions
        like findPileArray/resolveDropTarget/canMoveWithWiden/tryMoveAuto
        that know the specific rules of that game.
     4. Call the other SEngine.* helpers (preload, fitBoard, undo,
        settings, cascade) as needed from its own renderAll()/newGame().

   Every function below is written so a bug fixed here (e.g. the drag
   "always snaps back" issue, or the tableau highlight sizing bug) is
   fixed for every game that uses this file, permanently — that's the
   whole point of pulling it out of Klondike's file in the first place.
   ========================================================================= */
window.SEngine = (function(){
"use strict";

/* =========================================================
   CARD IDENTITY + ASSET PATHS
   Every game shares the same 52-card model and the same cards/
   folder convention: cards/<rank>_of_<suit>.svg and cards/back_<id>.png
   ========================================================= */
const SUITS = ['S','H','D','C'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
function rankValue(r){ return RANKS.indexOf(r)+1; }
function isRed(suit){ return suit==='H'||suit==='D'; }
function suitGlyph(suit){ return {S:'♠',H:'♥',D:'♦',C:'♣'}[suit]; }

const RANK_FILE = {A:'ace', J:'jack', Q:'queen', K:'king'};
function rankFile(rank){ return RANK_FILE[rank] || rank; }
const SUIT_FILE = {S:'spades', H:'hearts', D:'diamonds', C:'clubs'};
function suitFile(suit){ return SUIT_FILE[suit]; }
function cardImgSrc(card){ return 'cards/'+rankFile(card.rank)+'_of_'+suitFile(card.suit)+'.svg'; }
function backImgSrc(style){ return 'cards/'+style; } // style is a full filename, e.g. "back_10.png"

// Point an <img> at a local file; if it 404s, call onFinalFail instead.
// No external fallback — keeps every game working fully offline.
function loadCardImage(img, localPath, onFinalFail){
  img.src = localPath;
  img.addEventListener('error', function onErr(){
    img.removeEventListener('error', onErr);
    if(onFinalFail) onFinalFail();
  });
}

// A fresh, unshuffled 52-card deck. `id` is stable and never changes as
// the card moves between piles — every game should carry it through.
function buildDeck(){
  const deck = [];
  let id = 0;
  for(const s of SUITS){
    for(const r of RANKS){
      deck.push({ id:'c'+(id++), rank:r, suit:s, faceUp:false });
    }
  }
  return deck;
}
// Fisher-Yates shuffle.
function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr;
}

/* =========================================================
   CARD DOM ELEMENTS
   ========================================================= */
// Face-up card: real artwork with a text/corner-index fallback if the
// image 404s. `covered` (true/false) controls whether the fallback's
// corner badge lays out vertically (fully exposed card) or horizontally
// (something's stacked on top of it, so only a thin strip stays visible
// — see the matching CSS comment on .img-fallback .fc-corner).
function buildFaceEl(card, covered){
  const wrap = document.createElement('div');
  wrap.className = 'face';
  const img = document.createElement('img');
  img.className = 'card-face-img';
  img.alt = card.rank+' of '+suitFile(card.suit);
  img.draggable = false;
  loadCardImage(img, cardImgSrc(card), ()=>{
    const cls = isRed(card.suit)?'suit-red':'suit-black';
    const glyph = suitGlyph(card.suit);
    const cornerCls = 'fc-corner'+(covered?' stacked':'');
    wrap.innerHTML = '<div class="img-fallback '+cls+'">'+
      '<div class="'+cornerCls+' tl"><span>'+card.rank+'</span><span>'+glyph+'</span></div>'+
      '<div class="fc-center"><span>'+card.rank+'</span><span>'+glyph+'</span></div>'+
      '<div class="'+cornerCls+' br"><span>'+card.rank+'</span><span>'+glyph+'</span></div>'+
    '</div>';
  });
  wrap.appendChild(img);
  return wrap;
}
// Face-down card: shows whichever back image `backStyle` names (a full
// filename, e.g. "back_10.png" — matches whatever the game's Settings
// back-picker currently has selected).
function buildBackEl(backStyle){
  const wrap = document.createElement('div');
  wrap.className = 'back-img-wrap';
  const img = document.createElement('img');
  img.className = 'card-back-img';
  img.alt = 'card back';
  img.draggable = false;
  loadCardImage(img, backImgSrc(backStyle));
  wrap.appendChild(img);
  return wrap;
}

// Builds one card's full DOM element (face or back), stashes its pile
// location in data-* attributes (used everywhere by the interaction
// system to figure out "what did the player just click/drag"), and
// wires up its drag/click handlers via attachFn (typically
// SEngine's own internal attachCardEvents, passed in by initInteractions
// consumers indirectly — see makeCardEl usage in a game file).
function makeCardEl(card, pileType, pileKey, index, covered, backStyle, attachFn){
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = card.id;
  el.dataset.pile = pileType;
  el.dataset.key = pileKey;
  el.dataset.index = index;
  el.appendChild(card.faceUp ? buildFaceEl(card, !!covered) : buildBackEl(backStyle));
  if(attachFn) attachFn(el, card, pileType, pileKey, index);
  return el;
}

// Sweeps away any stray .card element sitting directly in <body> — a
// safety net for the scenario that used to cause floating duplicated
// cards: a drag clone gets reparented to <body> mid-drag, and if some
// OTHER render fires before the drag finishes, that render only clears
// cards inside real pile containers, never touches the orphan. Call
// this at the very top of every renderAll().
function purgeStrayCards(){
  document.querySelectorAll('body > .card').forEach(el=>el.remove());
}

// Fires all 52 face images + every listed back file as background
// Image() requests immediately, before any card is ever dealt or
// flipped — without this, the FIRST time any given card appears
// face-up mid-game there's real fetch+decode latency and it shows up
// blank for a moment.
function preloadAllCardImages(backFiles){
  const urls = [];
  for(const s of SUITS){
    for(const r of RANKS){
      urls.push(cardImgSrc({rank:r, suit:s}));
    }
  }
  (backFiles||[]).forEach(f=> urls.push(backImgSrc(f)));
  urls.forEach(url=>{
    const img = new Image();
    img.src = url;
  });
}

/* =========================================================
   SCREEN-FIT SIZING
   Solves for the biggest card width that fits the CURRENT window
   without needing to scroll, exactly like Klondike's fitBoard did —
   generalized here to accept how many tableau columns a game has and
   a function to compute the deepest current stack, since that varies
   per game (and, for FreeCell, per game STATE — an empty column vs a
   column that grew past its starting depth).
   ========================================================= */
const CARD_RATIO = 1.4523; // must match the real card-art aspect ratio; keep in sync with --card-h in CSS
function cardMetrics(overlapFrac){
  const w = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-w')) || 80;
  const h = w * CARD_RATIO;
  return { w, h, overlap: h*(overlapFrac==null?0.183:overlapFrac), fan: w*0.22 };
}

// opts: {
//   columns: how many tableau columns wide the board is,
//   getMaxStackDepth: () => number (deepest current column/pile),
//   overlapFrac: vertical overlap fraction (default 0.183),
//   maxCardW: real upper cap on card width (default 104). minCardW is
//     accepted for backward compatibility but no longer enforced as a
//     floor — see the comment above cardW below for why.
// }
function fitBoard(opts){
  const header = document.querySelector('header');
  const stage = document.querySelector('.stage');
  const frame = document.querySelector('.table-frame');
  const felt = document.querySelector('.table-felt');
  const bottombar = document.querySelector('.bottombar');
  if(!header || !stage || !frame || !felt) return;

  const overlapFrac = opts.overlapFrac==null ? 0.183 : opts.overlapFrac;
  const columns = opts.columns;
  const minCardW = opts.minCardW==null ? 44 : opts.minCardW;
  const maxCardW = opts.maxCardW==null ? 104 : opts.maxCardW;

  const headerH = header.getBoundingClientRect().height;
  const bottombarH = bottombar ? bottombar.getBoundingClientRect().height : 0;
  const stageCS = getComputedStyle(stage);
  const frameCS = getComputedStyle(frame);
  const feltCS = getComputedStyle(felt);

  const vPad = parseFloat(stageCS.paddingTop)+parseFloat(stageCS.paddingBottom)
             + parseFloat(frameCS.paddingTop)+parseFloat(frameCS.paddingBottom)
             + parseFloat(feltCS.paddingTop)+parseFloat(feltCS.paddingBottom);
  const hPad = parseFloat(stageCS.paddingLeft)+parseFloat(stageCS.paddingRight)
             + parseFloat(frameCS.paddingLeft)+parseFloat(frameCS.paddingRight)
             + parseFloat(feltCS.paddingLeft)+parseFloat(feltCS.paddingRight);

  const availH = window.innerHeight - headerH - bottombarH - vPad - 10;
  const availW = Math.min(window.innerWidth, 1240) - hPad - 8;

  // These used to be flat guesses (10px gap, 18px top-row margin) —
  // but the real CSS values are viewport-relative (--gap is
  // clamp(6px,1.2vw,14px); the top-row's margin-bottom is
  // clamp(10px,2vw,20px)), and on a phone-width screen both resolve
  // noticeably smaller than those guesses. That mismatch was reserving
  // more space than the board actually needed, so cards rendered
  // smaller than they had room to be — reading the browser's own
  // resolved values instead fixes that at any viewport size or zoom
  // level, rather than needing a size-specific fudge factor.
  const topRowEl = document.querySelector('.top-row');
  const tableauRowEl = document.querySelector('.tableau-row');
  const topRowGap = topRowEl ? (parseFloat(getComputedStyle(topRowEl).marginBottom) || 18) : 18;
  const maxStack = Math.max(opts.minStackForFit||7, opts.getMaxStackDepth ? opts.getMaxStackDepth() : 7);
  const denom = 2 + (maxStack-1)*overlapFrac;
  const cardHByHeight = (availH - topRowGap) / denom;
  const cardWByHeight = cardHByHeight / CARD_RATIO;

  // Width is bound by whichever row of the board needs the most space
  // per card. Normally that's just the tableau (`columns` wide), but a
  // game can pass opts.extraRows — e.g. [{units, gaps}, ...] — to
  // describe any other row (free cells + a decorative slot + foundations,
  // say) whose own card-count/gap math might actually be MORE demanding
  // than the tableau's. Without this, a row like that can end up wider
  // than the screen even though the tableau fits fine, which is exactly
  // what was pushing FreeCell's rightmost foundation off-screen on
  // narrow/mobile viewports.
  const gapPx = tableauRowEl ? (parseFloat(getComputedStyle(tableauRowEl).columnGap) || 10) : 10;
  const rows = [{units: columns, gaps: columns-1}].concat(opts.extraRows || []);
  let cardWByWidth = Infinity;
  rows.forEach(r=>{
    const cw = (availW - gapPx*r.gaps) / r.units;
    if(cw < cardWByWidth) cardWByWidth = cw;
  });

  // maxCardW is a real cap (cards shouldn't keep growing forever on a
  // huge monitor). minCardW is NOT enforced the same way — forcing the
  // card up to a minimum regardless of available space is exactly what
  // was still causing the mobile overflow after the extraRows fix: on
  // a narrow phone the true fit-safe width can genuinely be below 44px,
  // and clamping it back up to 44 pushes the whole board past the edge
  // of the screen again. minCardW only ever applies when honoring it
  // still fits — it can shrink the ceiling, never force an overflow.
  let cardW = Math.min(cardWByHeight, cardWByWidth, maxCardW);
  document.documentElement.style.setProperty('--card-w', cardW+'px');
}

/* =========================================================
   DRAG-AND-DROP + CLICK-TO-MOVE
   One shared interaction system for every game. Call
   SEngine.initInteractions(config) ONCE after your DOM/piles exist.
   config fields (all required unless noted):
     findPileArray(pileType, pileKey) -> array
        Same idea as Klondike's findPileArray — turns a pile
        descriptor into the actual card array.
     isCardMovable(card, pileType, pileKey, index) -> bool
        Should this specific card even start a drag/click? (face-up,
        and — depending on the game — only the top card of some pile
        types.)
     resolveDropTarget(x, y) -> {type, key, highlightEl} | null
        Exact hit-test (elementFromPoint-based) used while dragging.
     resolveHoverTargetPadded(x, y) -> {type, key, highlightEl} | null
        Same shape, but with generous padding around each pile's box —
        used for click-to-move's cursor-hover highlight (see
        SEngine.makePaddedResolver below for a ready-made version).
     canMoveWithWiden(fromType, fromKey, fromIndex, toType, toKey) -> index | -1
        Game's rule check, INCLUDING misclick-widening if desired.
        Return the index engine should actually use, or -1 if illegal.
     tryMoveAuto(fromType, fromKey, fromIndex, toType, toKey) -> bool
        Actually performs the move (mutates the game's state and
        re-renders) if legal. Called on drop / on destination click.
     onRenderNeeded()
        Called after a failed drop/drag-cancel so the game can redraw
        everything back to its pre-drag position.
     autoMoveToFoundation(pileType, pileKey, index) -> bool   [optional]
        Used for double-tap-to-send-home. Omit to disable double-tap.
     onSelectionChanged()   [optional]
        Called whenever the click-to-move selection changes (engine
        manages the actual "selected" bookkeeping internally and calls
        this so the game can do any of its own bookkeeping if needed).
   The game triggers card element listeners by passing SEngine's
   attachCardEvents (exposed below) as the `attachFn` to makeCardEl.
   ========================================================= */
let dragCtx = null;
let dragMoved = false;
let lastTapTime = 0;
let lastTapKey = '';
let dragEls = [];
let lastPointer = {x:0,y:0};
let ixConfig = null;
let selected = null; // {pileType, pileKey, index} while something is picked up via click-to-move

function clearDropHighlights(){
  document.querySelectorAll('.drop-ok').forEach(el=>el.classList.remove('drop-ok'));
}

function getSelected(){ return selected; }

function clearSelection(){
  if(selected){
    document.querySelectorAll('.card.selected').forEach(e=>e.classList.remove('selected'));
    selected = null;
    if(ixConfig && ixConfig.onSelectionChanged) ixConfig.onSelectionChanged();
  }
  clearDropHighlights();
}

// A ready-made resolveHoverTargetPadded implementation: pass a function
// that returns an array of {type, key, el} zones (every pile a card
// could conceivably be dropped on), and this returns a resolver
// checking each zone's bounding box plus `padding` extra pixels on
// every side — more forgiving than exact pixel hit-testing, which is
// what click-to-move's hover highlight wants (there's no dragged
// element to test against, just a bare cursor position).
function makePaddedResolver(getZones, padding){
  padding = padding==null ? 26 : padding;
  return function(x, y){
    const zones = getZones();
    for(const z of zones){
      const r = z.el.getBoundingClientRect();
      if(x>=r.left-padding && x<=r.right+padding && y>=r.top-padding && y<=r.bottom+padding){
        return { type:z.type, key:z.key, highlightEl:z.el };
      }
    }
    return null;
  };
}

function attachCardEvents(el, card, pileType, pileKey, index){
  if(!ixConfig.isCardMovable(card, pileType, pileKey, index)){
    el.style.cursor = 'default';
    return;
  }
  el.style.cursor = 'grab';
  el.addEventListener('pointerdown', (e)=>{
    if(e.button!==undefined && e.button!==0) return;
    dragMoved = false;
    dragCtx = { el, card, pileType, pileKey, index, startX:e.clientX, startY:e.clientY };
    try{ el.setPointerCapture(e.pointerId); }catch(err){}
  });
}

function beginVisualDrag(pileType, pileKey, index){
  const pile = ixConfig.findPileArray(pileType, pileKey);
  const cards = pile.slice(index); // works for both "just the top card" (index===length-1) and a multi-card run
  dragEls = [];
  cards.forEach((c)=>{
    const el = document.querySelector('.card[data-id="'+c.id+'"]');
    if(!el) return;
    const rect = el.getBoundingClientRect();
    el.classList.add('dragging');
    el.style.position='fixed';
    el.style.left = rect.left+'px';
    el.style.top = rect.top+'px';
    el.style.zIndex = 999;
    // pointer-events:none is what makes drop-target hit-testing see
    // THROUGH the dragged card to whatever's underneath it — without
    // this, the dragged card (which follows the cursor) is always the
    // topmost element at the drop point, and elementFromPoint would
    // find it instead of the real target, so every drop would fail.
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    dragEls.push({el, baseLeft:rect.left, baseTop:rect.top});
  });
  clearDropHighlights();
}
function updateVisualDrag(dx, dy){
  dragEls.forEach(d=>{
    d.el.style.left = (d.baseLeft+dx)+'px';
    d.el.style.top = (d.baseTop+dy)+'px';
  });
  clearDropHighlights();
  const target = ixConfig.resolveDropTarget(lastPointer.x, lastPointer.y);
  if(target && dragCtx){
    const idx = ixConfig.canMoveWithWiden(dragCtx.pileType, dragCtx.pileKey, dragCtx.index, target.type, target.key);
    if(idx>=0) target.highlightEl.classList.add('drop-ok');
  }
}
function cleanupDragEls(){
  dragEls.forEach(d=>{
    d.el.classList.remove('dragging');
    d.el.style.position=''; d.el.style.left=''; d.el.style.top=''; d.el.style.zIndex=''; d.el.style.pointerEvents='';
    if(d.el.parentNode === document.body) d.el.remove();
  });
  dragEls = [];
}
function endVisualDrag(x,y){
  const target = ixConfig.resolveDropTarget(x,y);
  clearDropHighlights();
  let success = false;
  if(target){
    success = ixConfig.tryMoveAuto(dragCtx.pileType, dragCtx.pileKey, dragCtx.index, target.type, target.key);
  }
  cleanupDragEls();
  if(!success && ixConfig.onRenderNeeded) ixConfig.onRenderNeeded();
}
function cancelVisualDrag(){
  cleanupDragEls();
  if(ixConfig.onRenderNeeded) ixConfig.onRenderNeeded();
}

function updateSelectHoverHighlight(x, y){
  clearDropHighlights();
  if(!selected) return;
  const target = ixConfig.resolveHoverTargetPadded(x, y);
  if(!target) return;
  if(selected.pileType==='tableau' && target.type==='tableau' && String(selected.pileKey)===String(target.key)) return;
  if(ixConfig.canMoveWithWiden(selected.pileType, selected.pileKey, selected.index, target.type, target.key) >= 0){
    target.highlightEl.classList.add('drop-ok');
  }
}

// The click-to-move state machine: first click picks a card up, a
// second click either completes the move (if it landed on a different,
// valid destination), cancels the selection (clicked the same card
// again), or re-selects a different card (if the move attempt failed —
// lets you change your mind without an extra click to deselect first).
function handleTapSelect(pileType, pileKey, index, card){
  if(selected){
    const sel = selected;
    if(sel.pileType===pileType && String(sel.pileKey)===String(pileKey) && sel.index===index){
      clearSelection(); return;
    }
    const moved = ixConfig.tryMoveAuto(sel.pileType, sel.pileKey, sel.index, pileType, pileKey);
    clearSelection();
    if(moved) return;
  }
  clearSelection();
  selected = {pileType, pileKey, index};
  if(ixConfig.onSelectionChanged) ixConfig.onSelectionChanged();
  const pile = ixConfig.findPileArray(pileType, pileKey);
  const cards = pile.slice(index);
  cards.forEach(c=>{
    const el = document.querySelector('.card[data-id="'+c.id+'"]');
    if(el) el.classList.add('selected');
  });
}

function initInteractions(config){
  ixConfig = config;

  document.addEventListener('pointermove', (e)=>{
    lastPointer.x = e.clientX; lastPointer.y = e.clientY;
    if(!dragCtx){
      if(selected) updateSelectHoverHighlight(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX-dragCtx.startX, dy = e.clientY-dragCtx.startY;
    if(!dragMoved && Math.hypot(dx,dy) < 6) return;
    if(!dragMoved){
      dragMoved = true;
      beginVisualDrag(dragCtx.pileType, dragCtx.pileKey, dragCtx.index);
    }
    updateVisualDrag(dx, dy);
  });

  document.addEventListener('pointerup', (e)=>{
    if(!dragCtx) return;
    const ctx = dragCtx;
    if(dragMoved){
      endVisualDrag(e.clientX, e.clientY);
    } else {
      const key = ctx.pileType+':'+ctx.pileKey+':'+ctx.index;
      const now = Date.now();
      if(key===lastTapKey && now-lastTapTime < 320 && ixConfig.autoMoveToFoundation){
        ixConfig.autoMoveToFoundation(ctx.pileType, ctx.pileKey, ctx.index);
        clearSelection();
        lastTapKey = '';
      } else {
        handleTapSelect(ctx.pileType, ctx.pileKey, ctx.index, ctx.card);
        lastTapKey = key; lastTapTime = now;
      }
    }
    dragCtx = null; dragMoved = false;
  });

  document.addEventListener('pointercancel', ()=>{
    if(!dragCtx) return;
    cancelVisualDrag();
    dragCtx = null; dragMoved = false;
  });

  window.addEventListener('blur', ()=>{
    if(dragCtx){ cancelVisualDrag(); dragCtx = null; dragMoved = false; }
  });
}

/* =========================================================
   UNDO STACK
   Generic JSON-snapshot push/pop. The game decides what "the state"
   means by providing getSnapshot()/applySnapshot() — this file never
   assumes anything about the shape of a game's piles.
   ========================================================= */
function createUndoStack(getSnapshot, applySnapshot, undoButtonEl, maxDepth){
  const stack = [];
  maxDepth = maxDepth || 200;
  function updateButton(){
    if(undoButtonEl) undoButtonEl.style.opacity = stack.length ? '1' : '0.4';
  }
  return {
    push(){
      stack.push(JSON.stringify(getSnapshot()));
      if(stack.length>maxDepth) stack.shift();
      updateButton();
    },
    undo(){
      if(!stack.length) return false;
      applySnapshot(JSON.parse(stack.pop()));
      updateButton();
      return true;
    },
    reset(){ stack.length = 0; updateButton(); },
    canUndo(){ return stack.length>0; },
    updateButton
  };
}

/* =========================================================
   TOAST + HINT PULSE
   ========================================================= */
let toastTimer = null;
function showToast(toastEl, msg, ms){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> toastEl.classList.remove('show'), ms || 2200);
}
// Briefly glows an element (see @keyframes pulseGlow in the shared CSS).
// The remove-then-reflow-then-add dance forces the animation to restart
// even if this same element was just pulsed a moment ago.
function pulse(el){
  if(!el) return;
  el.classList.remove('hint-pulse');
  void el.offsetWidth;
  el.classList.add('hint-pulse');
  setTimeout(()=> el.classList.remove('hint-pulse'), 1500);
}
// Same idea as pulse() above, but for highlighting several cards at
// once for a shorter, fixed duration — used by the "Show Next"
// foundation-preview button so every currently-eligible card lights up
// together instead of one at a time.
function pulseAll(els, duration){
  const ms = duration || 1000;
  els.forEach(el=>{
    if(!el) return;
    el.classList.remove('hint-pulse');
    void el.offsetWidth;
    el.classList.add('hint-pulse');
  });
  setTimeout(()=>{ els.forEach(el=>{ if(el) el.classList.remove('hint-pulse'); }); }, ms);
}

/* =========================================================
   WIN CASCADE ANIMATION
   Launches one floating copy of each given card from its foundation
   position, arcs it under gravity, bounces off the bottom a few times,
   then fades out. `cards` is an ordered array of {card, sourceEl}.
   `buildFaceElFn` should be the game's own face-builder (so art/back
   settings match); `getCardMetrics` should return {w,h}.
   ========================================================= */
function startWinCascade(cards, buildFaceElFn, getCardMetrics, opts){
  opts = opts || {};
  const layer = document.createElement('div');
  layer.id = 'cascade-layer';
  document.body.appendChild(layer);

  const STAGGER = opts.stagger!=null ? opts.stagger : 90;
  const GRAVITY = opts.gravity!=null ? opts.gravity : 0.35;
  const BOUNCE_DAMP = opts.bounceDamp!=null ? opts.bounceDamp : 0.62;
  const TRAIL = !!opts.trail; // classic dense-pile look: settled cards stay put instead of fading
  const SEQUENTIAL = !!opts.sequential; // next card waits for the previous one's first bounce, not a fixed timer

  if(SEQUENTIAL){
    let i = 0;
    function launchNext(){
      if(i >= cards.length) return;
      const entry = cards[i++];
      spawnCascadeCard(layer, entry, buildFaceElFn, getCardMetrics, GRAVITY, BOUNCE_DAMP, TRAIL, launchNext);
    }
    launchNext();
  } else {
    cards.forEach((entry, i)=>{
      setTimeout(()=> spawnCascadeCard(layer, entry, buildFaceElFn, getCardMetrics, GRAVITY, BOUNCE_DAMP, TRAIL), i*STAGGER);
    });
  }
  setTimeout(()=>{ layer.remove(); }, cards.length*STAGGER + 6000);
  return layer;
}
function spawnCascadeCard(layer, entry, buildFaceElFn, getCardMetrics, gravity, bounceDamp, trail, onFirstBounce){
  if(!entry.sourceEl){ if(onFirstBounce) onFirstBounce(); return; }
  const startRect = entry.sourceEl.getBoundingClientRect();
  const metrics = getCardMetrics();

  const el = document.createElement('div');
  el.className = 'card cascade-card';
  el.style.width = metrics.w+'px';
  el.style.height = metrics.h+'px';
  el.style.left = startRect.left+'px';
  el.style.top = startRect.top+'px';
  el.appendChild(buildFaceElFn(entry.card, false));
  layer.appendChild(el);

  let x = startRect.left, y = startRect.top;
  let vx = (Math.random()<0.5 ? -1 : 1) * (2.5 + Math.random()*1.8);
  let vy = -7 - Math.random()*3;
  const floorY = window.innerHeight - metrics.h - 8;
  let bounces = 0;
  let firstBounceFired = false;

  function frame(){
    vy += gravity;
    x += vx;
    y += vy;
    if(y >= floorY){
      y = floorY;
      vy = -vy*bounceDamp;
      bounces++;
      if(!firstBounceFired){
        firstBounceFired = true;
        if(onFirstBounce) onFirstBounce();
      }
      if(Math.abs(vy) < 2.2 || bounces > 6){
        el.style.left = x+'px';
        el.style.top = y+'px';
        if(trail) return; // stays put, visible, building up the pile — cleared only when the whole layer removes itself
        el.style.transition = 'opacity .6s ease';
        el.style.opacity = '0';
        setTimeout(()=> el.remove(), 650);
        return;
      }
    }
    if(x < -metrics.w-60 || x > window.innerWidth+60){
      if(!firstBounceFired && onFirstBounce){ firstBounceFired = true; onFirstBounce(); }
      el.remove(); return;
    }
    el.style.left = x+'px';
    el.style.top = y+'px';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* =========================================================
   SETTINGS MODAL SHELL
   Wires up the parts of Settings that are the same in every game:
   card-back picker (live preview, click to select) + timer/score
   toggles + Cancel/Apply/Apply&NewGame semantics with a snapshot to
   revert to. A game adds its OWN extra fields (like Klondike's Draw
   1/3) alongside these by wiring its own extra controls and passing
   extraSnapshot()/extraRestore()/extraOnOpen() callbacks so those
   values ride along in the same snapshot/revert cycle.
   config: {
     state, pendingSettings,          // the game's own objects (read/write directly)
     overlayEl, backPickerSwatchSelector,
     togTimerEl, togScoreEl,
     applyHudVisibility(), syncTimerInterval(), onRenderNeeded(),
     extraSnapshot(), extraRestore(snap), extraOnOpen()   [all optional]
   }
   Returns {open, revert, refreshBackPicker} in case the game needs to
   trigger them itself (e.g. a "New Game" flow that also resets Settings).
   ========================================================= */
function wireSettingsShell(cfg){
  let snapshot = null;
  function open(){
    snapshot = Object.assign({
      backStyle: cfg.state.backStyle, showTimer: cfg.state.showTimer, showScore: cfg.state.showScore
    }, cfg.extraSnapshot ? cfg.extraSnapshot() : {});
    cfg.pendingSettings.backStyle = cfg.state.backStyle;
    cfg.pendingSettings.showTimer = cfg.state.showTimer;
    cfg.pendingSettings.showScore = cfg.state.showScore;
    cfg.togTimerEl.checked = cfg.state.showTimer;
    cfg.togScoreEl.checked = cfg.state.showScore;
    refreshBackPicker();
    if(cfg.extraOnOpen) cfg.extraOnOpen();
    cfg.overlayEl.classList.add('show');
  }
  function revert(){
    if(!snapshot) return;
    cfg.state.backStyle = snapshot.backStyle;
    cfg.state.showTimer = snapshot.showTimer;
    cfg.state.showScore = snapshot.showScore;
    cfg.pendingSettings.backStyle = snapshot.backStyle;
    cfg.pendingSettings.showTimer = snapshot.showTimer;
    cfg.pendingSettings.showScore = snapshot.showScore;
    if(cfg.extraRestore) cfg.extraRestore(snapshot);
    cfg.syncTimerInterval();
    cfg.applyHudVisibility();
    cfg.onRenderNeeded();
  }
  function refreshBackPicker(){
    document.querySelectorAll(cfg.backPickerSwatchSelector).forEach(sw=>{
      sw.classList.toggle('active', sw.dataset.val===cfg.pendingSettings.backStyle);
    });
  }
  document.querySelectorAll(cfg.backPickerSwatchSelector).forEach(sw=>{
    sw.addEventListener('click', ()=>{
      cfg.pendingSettings.backStyle = sw.dataset.val;
      cfg.state.backStyle = sw.dataset.val;
      refreshBackPicker();
      cfg.onRenderNeeded();
    });
  });
  cfg.togTimerEl.addEventListener('change', (e)=>{
    cfg.pendingSettings.showTimer = e.target.checked;
    cfg.state.showTimer = e.target.checked;
    cfg.syncTimerInterval();
    cfg.applyHudVisibility();
  });
  cfg.togScoreEl.addEventListener('change', (e)=>{
    cfg.pendingSettings.showScore = e.target.checked;
    cfg.state.showScore = e.target.checked;
    cfg.applyHudVisibility();
  });
  cfg.overlayEl.addEventListener('click', (e)=>{ if(e.target===cfg.overlayEl){ revert(); cfg.overlayEl.classList.remove('show'); } });

  return { open, revert, refreshBackPicker };
}

// Makes every element matching squareSelector exactly as tall AND
// wide as referenceSelector's real rendered height — used to keep
// .home-btn a true circle matching .newgame-btn's height. CSS alone
// (flex align-items:stretch + aspect-ratio:1) turned out not to be
// reliably honored for this combination, so this measures the actual
// box directly instead of hoping the two stay in sync on their own.
// Makes every .home-btn exactly as tall AND wide as #btn-newgame's
// real rendered height, so it's a true circle matching New Game
// regardless of font-metric quirks (CSS align-items:stretch +
// aspect-ratio:1 wasn't reliably doing this on its own). Entirely
// self-initializing — runs itself on load and on resize, so no game
// file needs to call anything for this; it's genuinely shared, the
// way styles.css is, not something each page has to wire up.
// The score/time chip visibility logic — identical in every game, so
// it lives here instead of being copy-pasted into each one. Each game
// still needs its own tiny wrapper (state is a per-file variable), but
// the actual behavior is defined exactly once.
function applyHudVisibility(state){
  const scoreEl = document.getElementById('chip-score');
  const timeEl = document.getElementById('chip-time');
  if(scoreEl) scoreEl.style.display = state.showScore ? 'flex' : 'none';
  if(timeEl) timeEl.style.display = state.showTimer ? 'flex' : 'none';
  // Optional — only FreeCell has this chip at all. Shown only when
  // BOTH the mobile breakpoint is active and the person has opted in
  // via the mobile-only settings toggle, so crossing the breakpoint
  // (e.g. rotating a tablet) needs this re-run, not just the toggle.
  const gameNumMobileEl = document.getElementById('game-number-chip-mobile');
  if(gameNumMobileEl){
    const isMobile = window.matchMedia('(max-width:560px)').matches;
    gameNumMobileEl.style.display = (isMobile && state.showGameNumberMobile) ? 'flex' : 'none';
  }
}

function syncHomeButtonSize(){
  const ref = document.getElementById('btn-newgame');
  if(!ref) return;
  const h = ref.getBoundingClientRect().height;
  if(!h) return;
  document.querySelectorAll('.home-btn').forEach(el=>{
    el.style.width = h+'px';
    el.style.height = h+'px';
  });
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', syncHomeButtonSize);
} else {
  syncHomeButtonSize();
}
let homeBtnResizeTimer = null;
window.addEventListener('resize', ()=>{
  clearTimeout(homeBtnResizeTimer);
  homeBtnResizeTimer = setTimeout(syncHomeButtonSize, 100);
});

/* =========================================================
   PUBLIC API
   ========================================================= */
return {
  SUITS, RANKS, rankValue, isRed, suitGlyph, rankFile, suitFile,
  cardImgSrc, backImgSrc, loadCardImage,
  buildDeck, shuffle,
  buildFaceEl, buildBackEl, makeCardEl, purgeStrayCards,
  preloadAllCardImages,
  CARD_RATIO, cardMetrics, fitBoard,
  attachCardEvents, initInteractions, clearSelection, getSelected, makePaddedResolver,
  createUndoStack,
  showToast, pulse, pulseAll,
  startWinCascade,
  wireSettingsShell,
  applyHudVisibility
};

})();
