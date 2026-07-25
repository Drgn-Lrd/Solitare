// mahjong.js

/* =========================================================
   DECK & GRAPHICS
   ========================================================= */
const SUITS = ['Bamboo', 'Character', 'Circle'];
const RANKS = ['1','2','3','4','5','6','7','8','9'];
const HONORS = ['Wind-N', 'Wind-S', 'Wind-E', 'Wind-W', 'Dragon-R', 'Dragon-G', 'Dragon-W'];
const BONUS = ['Flower-1', 'Flower-2', 'Flower-3', 'Flower-4', 'Season-1', 'Season-2', 'Season-3', 'Season-4'];

let currentTheme = 'White';

// FluffyStuff mapping is kept ready for when you drop files in later
const FLUFFY_STUFF_MAP = {
    'Circle-1':'pin1', 'Circle-2':'pin2', 'Circle-3':'pin3', 'Circle-4':'pin4', 'Circle-5':'pin5', 'Circle-6':'pin6', 'Circle-7':'pin7', 'Circle-8':'pin8', 'Circle-9':'pin9',
    'Bamboo-1':'sou1', 'Bamboo-2':'sou2', 'Bamboo-3':'sou3', 'Bamboo-4':'sou4', 'Bamboo-5':'sou5', 'Bamboo-6':'sou6', 'Bamboo-7':'sou7', 'Bamboo-8':'sou8', 'Bamboo-9':'sou9',
    'Character-1':'man1', 'Character-2':'man2', 'Character-3':'man3', 'Character-4':'man4', 'Character-5':'man5', 'Character-6':'man6', 'Character-7':'man7', 'Character-8':'man8', 'Character-9':'man9',
    'Wind-E':'ton', 'Wind-S':'nan', 'Wind-W':'sha', 'Wind-N':'pei',
    'Dragon-R':'chun', 'Dragon-G':'hatsu', 'Dragon-W':'haku'
};

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

// Attempts to find local image assets first; returns null if not found (triggers fallback)
function getTileImagePath(id) {
    // Uncomment this block once you upload your FluffyStuff files:
    /*
    if (FLUFFY_STUFF_MAP[id]) {
        return `MahjongTiles/${currentTheme}/${FLUFFY_STUFF_MAP[id]}.webp`;
    }
    */
    return null; // Forces fallback rendering for now
}

/* =========================================================
   LAYOUTS (3D Coordinates)
   ========================================================= */
const LAYOUTS = {
    'turtle': generateTurtleLayout(),
    'pyramid': generatePyramidLayout()
};

function generateTurtleLayout() {
    const layout = [];
    let id = 0;
    const add = (x, y, z) => layout.push({ posId: id++, x, y, z });

    for (let x = 1; x <= 12; x++) add(x, 0, 0);
    for (let x = 3; x <= 10; x++) add(x, 1, 0);
    for (let x = 2; x <= 11; x++) add(x, 2, 0);
    for (let x = 1; x <= 12; x++) add(x, 3, 0);
    add(0, 3.5, 0);  
    add(13, 3.5, 0); 
    add(14, 3.5, 0); 
    for (let x = 1; x <= 12; x++) add(x, 4, 0);
    for (let x = 2; x <= 11; x++) add(x, 5, 0);
    for (let x = 3; x <= 10; x++) add(x, 6, 0);
    for (let x = 1; x <= 12; x++) add(x, 7, 0);

    for (let y = 1; y <= 6; y++) {
        for (let x = 4; x <= 9; x++) add(x, y, 1);
    }
    for (let y = 2; y <= 5; y++) {
        for (let x = 5; x <= 8; x++) add(x, y, 2);
    }
    for (let y = 3; y <= 4; y++) {
        for (let x = 6; x <= 7; x++) add(x, y, 3);
    }
    add(6.5, 3.5, 4);

    return layout;
}

function generatePyramidLayout() {
    const layout = [];
    let id = 0;
    const add = (x, y, z) => layout.push({ posId: id++, x, y, z });

    for (let y = 0; y < 8; y++) {
        for (let x = 2; x < 10; x++) {
            add(x, y, 0);
        }
    }
    for (let y = 1; y < 7; y++) {
        for (let x = 3; x < 9; x++) {
            add(x, y, 1);
        }
    }
    for (let y = 2; y < 6; y++) {
        for (let x = 4; x < 8; x++) {
            add(x, y, 2);
        }
    }
    for (let y = 3; y < 5; y++) {
        for (let x = 5; x < 7; x++) {
            add(x, y, 3);
        }
    }
    add(5.5, 3.5, 4);

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
        
        const imgPath = getTileImagePath(tile.id);
        if (imgPath) {
            const img = document.createElement('img');
            img.className = 'tile-img';
            img.src = imgPath;
            img.alt = tile.id;
            img.onerror = () => {
                img.remove();
                addFallbackContent(tile.element, tile.id);
            };
            tile.element.appendChild(img);
        } else {
            addFallbackContent(tile.element, tile.id);
        }
        
        tile.element.style.left = `calc(var(--tile-w) * ${tile.x - 7})`; 
        tile.element.style.top = `calc(var(--tile-h) * ${tile.y - 3.5})`;
        tile.element.style.zIndex = Math.floor(tile.z * 1000 + tile.y * 10 + tile.x);

        tile.element.onclick = () => handleTileClick(tile);
        board.appendChild(tile.element);
        currentTiles.push(tile);
    });
    
    updateBoardState();
    scaleBoardToFit();
}

// Clean text layout for fallback tiles (Suit top badge + value center)
function addFallbackContent(element, id) {
    const container = document.createElement('div');
    container.className = 'tile-fallback';

    const topSpan = document.createElement('span');
    topSpan.className = 't-top';
    const mainSpan = document.createElement('span');
    mainSpan.className = 't-main';

    if (id.startsWith('Circle-')) {
        topSpan.innerText = 'CIRCLE';
        mainSpan.innerText = id.split('-')[1];
    } else if (id.startsWith('Bamboo-')) {
        topSpan.innerText = 'BAMBOO';
        mainSpan.innerText = id.split('-')[1];
    } else if (id.startsWith('Character-')) {
        topSpan.innerText = 'CHAR';
        mainSpan.innerText = id.split('-')[1];
    } else if (id.startsWith('Wind-')) {
        topSpan.innerText = 'WIND';
        mainSpan.innerText = id.split('-')[1];
    } else if (id.startsWith('Dragon-')) {
        topSpan.innerText = 'DRAGON';
        mainSpan.innerText = id.split('-')[1];
    } else if (id.startsWith('Flower-')) {
        topSpan.innerText = 'FLOWER';
        mainSpan.innerText = id.split('-')[1];
    } else if (id.startsWith('Season-')) {
        topSpan.innerText = 'SEASON';
        mainSpan.innerText = id.split('-')[1];
    }

    container.appendChild(topSpan);
    container.appendChild(mainSpan);
    element.appendChild(container);
}

function scaleBoardToFit() {
    const felt = document.querySelector('.table-felt');
    const wrapper = document.getElementById('scale-wrapper');
    if (!felt || !wrapper) return;

    wrapper.style.transform = 'scale(1)';
    const feltRect = felt.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();

    const scaleX = (feltRect.width - 24) / wrapperRect.width;
    const scaleY = (feltRect.height - 24) / wrapperRect.height;
    const finalScale = Math.min(scaleX, scaleY, 1);

    wrapper.style.transform = `scale(${finalScale})`;
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
        selectedTile.element.classList.remove('selected');
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

        if (t.z > target.z && Math.abs(t.x - target.x) < 0.99 && Math.abs(t.y - target.y) < 0.99) {
            blockedTop = true;
        }

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
        
        tile.element.innerHTML = '';
        const imgPath = getTileImagePath(tile.id);
        if (imgPath) {
            const img = document.createElement('img');
            img.className = 'tile-img';
            img.src = imgPath;
            img.alt = tile.id;
            img.onerror = () => {
                img.remove();
                addFallbackContent(tile.element, tile.id);
            };
            tile.element.appendChild(img);
        } else {
            addFallbackContent(tile.element, tile.id);
        }
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
   THEME SWITCHING
   ========================================================= */
function applyTheme(themeVal) {
    currentTheme = themeVal;
    
    const board = document.getElementById('board');
    if (themeVal === 'Black') {
        board.classList.add('theme-Black');
    } else {
        board.classList.remove('theme-Black');
    }

    currentTiles.forEach(tile => {
        if (tile.active) {
            const img = tile.element.querySelector('img');
            if (img) {
                img.src = getTileImagePath(tile.id);
            }
        }
    });
    
    document.querySelectorAll('.theme-swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.val === themeVal);
    });
}

document.querySelectorAll('.theme-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
        applyTheme(sw.dataset.val);
    });
});

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
window.addEventListener('resize', scaleBoardToFit);
