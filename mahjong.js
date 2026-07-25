// mahjong.js

// 1. Deck Generation (144 Tiles)
const SUITS = ['Bamboo', 'Character', 'Circle'];
const RANKS = ['1','2','3','4','5','6','7','8','9'];
const HONORS = ['Wind-N', 'Wind-S', 'Wind-E', 'Wind-W', 'Dragon-R', 'Dragon-G', 'Dragon-W'];
const BONUS = ['Flower-1', 'Flower-2', 'Flower-3', 'Flower-4', 'Season-1', 'Season-2', 'Season-3', 'Season-4'];

function buildMahjongDeck() {
    let deck = [];
    // 4 of each standard suit and honor
    for (let i = 0; i < 4; i++) {
        SUITS.forEach(suit => {
            RANKS.forEach(rank => deck.push({ id: `${suit}-${rank}`, display: `${rank}${suit[0]}` }));
        });
        HONORS.forEach(honor => deck.push({ id: honor, display: honor[0] }));
    }
    // 1 of each bonus tile
    BONUS.forEach(bonus => deck.push({ id: bonus.split('-')[0], display: bonus[0] }));
    return shuffleArray(deck);
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// 2. Layout Definitions (x, y, z coordinates in half-tile increments)
const LAYOUTS = {
    'pyramid': generatePyramidLayout(), // Simple layout for testing
    'turtle': generateTurtleLayout()    // Classic layout
};

// Generates a simple stacked pyramid to test the 3D mechanics
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

// Classic 144-tile Turtle layout coordinates
function generateTurtleLayout() {
    // Falls back to generating a grid of 144 tiles in a layered block for this script.
    // In a fully finished version, this is where you would map out all 144 precise X/Y/Z coords.
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

// 3. Game State & Interaction
let currentTiles = [];
let selectedTile = null;
let matches = 0;

function startNewGame(layoutName) {
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
        tile.element.innerText = tile.display; 
        
        // Convert grid coordinates to visual CSS positions
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
    } else if (selectedTile.id === tile.id) {
        // Match found!
        tile.active = false;
        selectedTile.active = false;
        tile.element.style.display = 'none';
        selectedTile.element.style.display = 'none';
        
        matches++;
        selectedTile = null;
        updateBoardState();
    } else {
        // Wrong match, switch selection
        selectedTile.element.classList.remove('selected');
        selectedTile = tile;
        tile.element.classList.add('selected');
    }
}

// Mahjong Rules: Free if no tile is directly on top, AND it's free on either left or right.
function isTileFree(target) {
    let blockedLeft = false;
    let blockedRight = false;
    let blockedTop = false;

    currentTiles.forEach(t => {
        if (!t.active || t.posId === target.posId) return;

        // Check if a tile is stacked directly on top (overlapping coordinates at a higher Z)
        if (t.z > target.z && Math.abs(t.x - target.x) < 2 && Math.abs(t.y - target.y) < 2) {
            blockedTop = true;
        }

        // Check left/right blockers on the exact same Z layer
        if (t.z === target.z && Math.abs(t.y - target.y) < 1) {
            if (t.x < target.x && target.x - t.x <= 2) blockedLeft = true;
            if (t.x > target.x && t.x - target.x <= 2) blockedRight = true;
        }
    });

    return !blockedTop && (!blockedLeft || !blockedRight);
}

function shuffleBoard() {
    // Only shuffle tiles that are currently active
    let activeTiles = currentTiles.filter(t => t.active);
    let activeData = activeTiles.map(t => ({ id: t.id, display: t.display }));
    
    activeData = shuffleArray(activeData);
    
    activeTiles.forEach((tile, i) => {
        tile.id = activeData[i].id;
        tile.display = activeData[i].display;
        tile.element.innerText = tile.display;
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

// Initialize on load
window.onload = () => startNewGame('turtle');