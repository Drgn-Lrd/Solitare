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
   ========================================================= */
const LAYOUTS = {
    'pyramid': generatePyramidLayout(),
    'turtle': generateTurtleLayout()
};

function generatePyramidLayout() {
    let layout = [];
    let id = 0;
    for (let z = 0; z < 4; z++) {
        let size = 4 - z;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                layout.push({ posId: id++, x: x * 2 + z, y: y * 2 + z, z: z });
            }
        }
    }
    return layout; 
}

function generateTurtleLayout() {
    let layout = [];
    let id = 0;
    for (let z = 0; z < 4; z++) {
        for (let y = 0; y < 6 - z; y++) {
            for (let x = 0; x < 6 - z; x++) {
                if(id < 144) layout.push({ posId: id++, x: x * 2 + (z*0.5), y: y * 2 + (z*0.5), z: z });
            }
        }
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
    const layoutName = document.getElementById('layout-select').value;
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
        
        // Add real tile image
        const img = document.createElement('img');
        img.className = 'tile-img';
        img.src = getTileImagePath(tile.id);
        
        // Fallback alt text in case the images are missing
        img.alt = tile.id; 
        tile.element.appendChild(img);
        
        tile.element.style.left = `calc(50% + ${(tile.x - 5) * 25}px)`; 
        tile.element.style.top = `calc(50% + ${(tile.y - 5) * 35}px)`;
        tile.element.style.zIndex = tile.z * 10 + tile.y; 

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
        if (t.z > target.z && Math.abs(t.x - target.x) < 2 && Math.abs(t.y - target.y) < 2) blockedTop = true;
        if (t.z === target.z && Math.abs(t.y - target.y) < 1) {
            if (t.x < target.x && target.x - t.x <= 2) blockedLeft = true;
            if (t.x > target.x && t.x - target.x <= 2) blockedRight = true;
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
        // Update image src
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
   UI MODAL WIRING (Matches FreeCell.html pattern)
   ========================================================= */
const confirmOverlay = document.getElementById('confirm-overlay');
document.getElementById('btn-newgame').addEventListener('click', ()=> confirmOverlay.classList.add('show'));
document.getElementById('confirm-cancel').addEventListener('click', ()=> confirmOverlay.classList.remove('show'));
document.getElementById('confirm-yes').addEventListener('click', ()=>{ confirmOverlay.classList.remove('show'); startNewGame(); });
confirmOverlay.addEventListener('click', (e)=>{ if(e.target===confirmOverlay) confirmOverlay.classList.remove('show'); });

const helpOverlay = document.getElementById('help-overlay');
document.getElementById('btn-help').addEventListener('click', ()=> helpOverlay.classList.add('show'));
document.getElementById('help-close').addEventListener('click', ()=> helpOverlay.classList.remove('show'));
helpOverlay.addEventListener('click', (e)=>{ if(e.target===helpOverlay) helpOverlay.classList.remove('show'); });

const settingsOverlay = document.getElementById('settings-overlay');
document.getElementById('btn-settings').addEventListener('click', ()=> settingsOverlay.classList.add('show'));
document.getElementById('settings-cancel').addEventListener('click', ()=> settingsOverlay.classList.remove('show'));
document.getElementById('settings-newgame').addEventListener('click', ()=>{
    settingsOverlay.classList.remove('show');
    startNewGame();
});
settingsOverlay.addEventListener('click', (e)=>{ if(e.target===settingsOverlay) settingsOverlay.classList.remove('show'); });

document.getElementById('btn-shuffle').addEventListener('click', shuffleBoard);

window.onload = startNewGame;
