// mahjong.js

/* =========================================================
   DECK & GRAPHICS
   ========================================================= */
const SUITS = ['Bamboo', 'Character', 'Circle'];
const RANKS = ['1','2','3','4','5','6','7','8','9'];
const HONORS = ['Wind-N', 'Wind-S', 'Wind-E', 'Wind-W', 'Dragon-R', 'Dragon-G', 'Dragon-W'];
const BONUS = ['Flower-1', 'Flower-2', 'Flower-3', 'Flower-4', 'Season-1', 'Season-2', 'Season-3', 'Season-4'];

function buildMahjongDeck() {
    let deck = [];
    for (let i = 0; i < 4; i++) {
        SUITS.forEach(suit => {
            RANKS.forEach(rank => deck.push({ id: `${suit}-${rank}`, type: 'standard' }));
        });
        HONORS.forEach(honor => deck.push({ id: honor, type: 'honor' }));
    }
    BONUS.forEach(bonus => deck.push({ id: bonus, type: bonus.split('-')[0] }));
    return shuffleArray(deck);
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Generates the image path based on the ID. 
// Requires a folder named "mahjong-tiles" in the root directory.
function getTileImagePath(id) {
    return `mahjong-tiles/${id}.webp`;
}

/* =========================================================
   LAYOUTS (3D Coordinates)
   Classic layouts require exactly 144 tiles. X and Y represent 
   grid units (1 unit = 1 tile width/height).
   ========================================================= */
const LAYOUTS = {
    'turtle': generateTurtleLayout(),
    'pyramid': generatePyramidLayout()
};

function generateTurtleLayout() {
    const layout = [];
    let id = 0;
    const add = (x, y, z) => layout.push({ posId: id++, x, y, z });

    // Layer 0 (Bottom) - 87 tiles
    for (let x = 1; x <= 12; x++) add(x, 0, 0);
    for (let x = 3; x <= 10; x++) add(x, 1, 0);
    for (let x = 2; x <= 11; x++) add(x, 2, 0);
    for (let x = 1; x <= 12; x++) add(x, 3, 0);
    add(0, 3.5, 0);  // Far left wing
    add(13, 3.5, 0); // Far right wing (inner)
    add(14, 3.5, 0); // Far right wing (outer)
    for (let x = 1; x <= 12; x++) add(x, 4, 0);
    for (let x = 2; x <= 11; x++) add(x, 5, 0);
    for (let x = 3; x <= 10; x++) add(x, 6, 0);
    for (let x = 1; x <= 12; x++) add(x, 7, 0);

    // Layer 1 - 36 tiles
    for (let y = 1; y <= 6; y++) {
        for (let x = 4; x <= 9; x++) add(x, y, 1);
    }

    // Layer 2 - 16 tiles
    for (let y = 2; y <= 5; y++) {
        for (let x = 5; x <= 8; x++) add(x, y, 2);
    }

    // Layer 3 - 4 tiles
    for (let y = 3; y <= 4; y++) {
        for (let x = 6; x <= 7; x++) add(x, y, 3);
    }

    // Layer 4 (Top) - 1 tile
    add(6.5, 3.5, 4);

    return layout;
}

function generatePyramidLayout() {
    const layout = [];
    let id = 0;
    const add = (x, y, z) => layout.push({ posId: id++, x, y, z });

    // Layer 0 - 80 tiles
    for(let y = 0; y <= 7; y++) {
        for(let x = 2.5; x <= 11.5; x++) add(x, y, 0);
    }
    // Layer 1 - 48 tiles
    for(let y = 1; y <= 6; y++) {
        for(let x = 3.5; x <= 10.5; x++) add(x, y, 1);
    }
    // Layer 2 - 16 tiles
    for(let y = 2; y <= 5; y++) {
        for(let x = 5.5; x <= 8.5; x++) add(x, y, 2);
    }
    
    return layout;
}

/* =========================================================
   GAME STATE & LOGIC
   ========================================================= */
let currentTiles = [];
let selectedTile = null;
let matches = 0;

function startNewGame() {
    const layoutName = document.getElementById('layout-select') ? document.getElementById('layout-select').value : 'turtle';
    const board = document.getElementById('board');
    board.innerHTML = '';
    
    let deck = buildMahjongDeck();
    let layout = LAYOUTS[layoutName].slice(0, deck.length); 
    
    currentTiles = [];
    matches = 0;
    selectedTile = null;

    layout.forEach((pos, index) => {
        if (!deck[index]) return;
        
        let tile = {
            ...pos,
            ...deck[index],
            active: true,
            element: document.createElement('div')
        };
        
        tile.element.className = 'tile';
        
        const img = document.createElement('img');
        img.className = 'tile-img';
        img.src = getTileImagePath(tile.id);
        img.alt = tile.id; 
        tile.element.appendChild(img);
        
        // Dynamic responsive scaling mapped to CSS variables. 
        // Subtract 7 on X and 3.5 on Y to perfectly center a 14-unit wide, 7-unit tall layout.
        tile.element.style.left = `calc(50% + (var(--tile-w) * ${tile.x - 7}))`; 
        tile.element.style.top = `calc(50% + (var(--tile-h) * ${tile.y - 3.5}))`;
        
        // Z-index sorting so 3D shadows render correctly
        tile.element.style.zIndex = Math.floor(tile.z * 1000 + tile.y * 10 + tile.x);

        tile.element.onclick = () => handleTileClick(tile);
        board.appendChild(tile.element);
        currentTiles.push(tile);
    });
    
    updateBoardState();
}

function handleTileClick(tile) {
    if (!tile.active || !isTileFree(tile)) return;

    if (!selectedTile) {
        selectedTile = tile;
        tile.element.classList.add('selected');
    } else if (selectedTile.posId === tile.posId) {
        selectedTile.element.classList.remove('selected');
        selectedTile = null;
    } else if (isMatch(selectedTile, tile)) {
        tile.active = false;
        selectedTile.active = false;
        tile.element.style.display = 'none';
        selectedTile.element.style.display = 'none';
        
        matches++;
        selectedTile = null;
        updateBoardState();
    } else {
        selectedTile.element.classList.remove('selected');
        selectedTile = tile;
        tile.element.classList.add('selected');
    }
}

// Special Mahjong matching rule: Seasons match Seasons, Flowers match Flowers.
function isMatch(tileA, tileB) {
    if (tileA.type === 'Flower' && tileB.type === 'Flower') return true;
    if (tileA.type === 'Season' && tileB.type === 'Season') return true;
    return tileA.id === tileB.id;
}

function isTileFree(target) {
    let blockedLeft = false;
    let blockedRight = false;
    let blockedTop = false;

    currentTiles.forEach(t => {
        if (!t.active || t.posId === target.posId) return;

        // Top Block: A tile exists on a higher Z-layer directly overlapping target's footprint.
        // Uses < 0.99 instead of < 1 to account for floating point coordinates in half-steps.
        if (t.z > target.z && Math.abs(t.x - target.x) < 0.99 && Math.abs(t.y - target.y) < 0.99) {
            blockedTop = true;
        }

        // Left/Right Block: A tile exists on the same Z-layer, overlaps vertically, and touches the side.
        if (t.z === target.z && Math.abs(t.y - target.y) < 0.99) {
            if (t.x < target.x && target.x - t.x < 1.1) blockedLeft = true;
            if (t.x > target.x && t.x - target.x < 1.1) blockedRight = true;
        }
    });

    return !blockedTop && (!blockedLeft || !blockedRight);
}

function shuffleBoard() {
    let activeTiles = currentTiles.filter(t => t.active);
    let activeData = activeTiles.map(t => ({ id: t.id, type: t.type }));
    
    activeData = shuffleArray(activeData);
    
    activeTiles.forEach((tile, i) => {
        tile.id = activeData[i].id;
        tile.type = activeData[i].type;
        tile.element.querySelector('img').src = getTileImagePath(tile.id);
        tile.element.querySelector('img').alt = tile.id;
    });
    
    if(selectedTile) {
        selectedTile.element.classList.remove('selected');
        selectedTile = null;
    }
    updateBoardState();
}

function updateBoardState() {
    let activeCount = 0;
    currentTiles.forEach(tile => {
        if (tile.active) {
            activeCount++;
            if (isTileFree(tile)) {
                tile.element.classList.remove('blocked');
            } else {
                tile.element.classList.add('blocked');
            }
        }
    });
    
    document.getElementById('tiles-left').innerText = activeCount;
    document.getElementById('matches-made').innerText = matches;
}

/* =========================================================
   UI MODAL WIRING 
   ========================================================= */
const confirmOverlay = document.getElementById('confirm-overlay');
if (confirmOverlay) {
    document.getElementById('btn-newgame').addEventListener('click', ()=> confirmOverlay.classList.add('show'));
    document.getElementById('confirm-cancel').addEventListener('click', ()=> confirmOverlay.classList.remove('show'));
    document.getElementById('confirm-yes').addEventListener('click', ()=>{ confirmOverlay.classList.remove('show'); startNewGame(); });
    confirmOverlay.addEventListener('click', (e)=>{ if(e.target===confirmOverlay) confirmOverlay.classList.remove('show'); });
} else {
    document.getElementById('btn-newgame').addEventListener('click', startNewGame);
}

const helpOverlay = document.getElementById('help-overlay');
if (helpOverlay) {
    document.getElementById('btn-help').addEventListener('click', ()=> helpOverlay.classList.add('show'));
    document.getElementById('help-close').addEventListener('click', ()=> helpOverlay.classList.remove('show'));
    helpOverlay.addEventListener('click', (e)=>{ if(e.target===helpOverlay) helpOverlay.classList.remove('show'); });
}

const settingsOverlay = document.getElementById('settings-overlay');
if (settingsOverlay) {
    document.getElementById('btn-settings').addEventListener('click', ()=> settingsOverlay.classList.add('show'));
    document.getElementById('settings-cancel').addEventListener('click', ()=> settingsOverlay.classList.remove('show'));
    document.getElementById('settings-newgame').addEventListener('click', ()=>{
        settingsOverlay.classList.remove('show');
        startNewGame();
    });
    settingsOverlay.addEventListener('click', (e)=>{ if(e.target===settingsOverlay) settingsOverlay.classList.remove('show'); });
}

const btnShuffle = document.getElementById('btn-shuffle');
if (btnShuffle) btnShuffle.addEventListener('click', shuffleBoard);

window.onload = startNewGame;
