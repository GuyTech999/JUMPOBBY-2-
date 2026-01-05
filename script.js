const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Set canvas size
canvas.width = 1000;
canvas.height = 600;

// Game state
let gameState = {
    level: 1,
    difficulty: 1,
    gameOver: false,
    paused: false
};

// Players
const player1 = {
    x: 50,
    y: 400,
    width: 40,
    height: 50,
    velocityX: 0,
    velocityY: 0,
    speed: 5,
    jumpPower: -15,
    onGround: false,
    health: 100,
    score: 0,
    color: '#ff6b6b',
    name: 'ผู้เล่น 1',
    isDead: false,
    ghostCooldown: 0,
    ghostAbilityUsed: false
};

const player2 = {
    x: 50,
    y: 450,
    width: 40,
    height: 50,
    velocityX: 0,
    velocityY: 0,
    speed: 5,
    jumpPower: -15,
    onGround: false,
    health: 100,
    score: 0,
    color: '#4ecdc4',
    name: 'ผู้เล่น 2',
    isDead: false,
    ghostCooldown: 0,
    ghostAbilityUsed: false
};

// Physics
const gravity = 0.8;
const friction = 0.85;

// Platforms
let platforms = [];
let enemies = [];
let collectibles = [];
let obstacles = [];
let movingPlatforms = [];
let goal = null;
let levelWidth = 0;
let goalPulse = 0;

// Blood particles for damage effect
let bloodParticles = [];

// Ghost abilities (effects from dead players)
let ghostEffects = [];
const GHOST_COOLDOWN = 1800; // 30 seconds in frames (assuming 60fps = 1800 frames)

// Ghost ability types
const GHOST_ABILITY_TYPES = {
    ICE_PLATFORM: 'ice_platform',
    WIND_PUSH: 'wind_push',
    SLIPPERY_FLOOR: 'slippery_floor',
    TEMP_OBSTACLE: 'temp_obstacle'
};

// Create ghost effect
function createGhostEffect(type, x, y, caster) {
    const alivePlayer = caster === player1 ? player2 : player1;
    if (alivePlayer.isDead) return; // Both dead, no effect
    
    switch(type) {
        case GHOST_ABILITY_TYPES.ICE_PLATFORM:
            // Find the nearest platform below or at player's level
            let nearestPlatform = null;
            let minDistance = Infinity;
            
            // Check all platforms
            for (let platform of platforms) {
                // Platform should be near player horizontally
                const playerCenterX = alivePlayer.x + alivePlayer.width / 2;
                const platformCenterX = platform.x + platform.width / 2;
                const horizontalDistance = Math.abs(playerCenterX - platformCenterX);
                
                // Platform should be at or below player (not too far above)
                const verticalDistance = platform.y - (alivePlayer.y + alivePlayer.height);
                
                // Find platform that's close horizontally and not too far below
                if (horizontalDistance < 200 && verticalDistance >= -50 && verticalDistance < minDistance) {
                    minDistance = verticalDistance;
                    nearestPlatform = platform;
                }
            }
            
            // If no platform found, use ground level
            let iceX = alivePlayer.x - 40;
            let iceY = canvas.height - 50;
            
            if (nearestPlatform) {
                // Place ice platform on top of the nearest platform
                iceX = nearestPlatform.x;
                iceY = nearestPlatform.y - 20; // Place on top of platform
            }
            
            ghostEffects.push({
                type: 'ice_platform',
                x: iceX,
                y: iceY,
                width: 120,
                height: 20,
                life: 600, // 10 seconds
                caster: caster
            });
            break;
            
        case GHOST_ABILITY_TYPES.WIND_PUSH:
            ghostEffects.push({
                type: 'wind_push',
                x: alivePlayer.x - 50,
                y: alivePlayer.y - 50,
                width: 200,
                height: 100,
                life: 300, // 5 seconds
                forceX: caster === player1 ? 3 : -3, // Push away from caster
                caster: caster
            });
            break;
            
        case GHOST_ABILITY_TYPES.SLIPPERY_FLOOR:
            ghostEffects.push({
                type: 'slippery_floor',
                x: alivePlayer.x - 100,
                y: canvas.height - 50,
                width: 300,
                height: 50,
                life: 900, // 15 seconds
                caster: caster
            });
            break;
            
        case GHOST_ABILITY_TYPES.TEMP_OBSTACLE:
            ghostEffects.push({
                type: 'temp_obstacle',
                x: alivePlayer.x + 50,
                y: alivePlayer.y - 30,
                width: 40,
                height: 40,
                life: 600, // 10 seconds
                damage: 2,
                caster: caster
            });
            break;
    }
}

// Update ghost effects
function updateGhostEffects() {
    for (let i = ghostEffects.length - 1; i >= 0; i--) {
        const effect = ghostEffects[i];
        effect.life--;
        
        if (effect.life <= 0) {
            ghostEffects.splice(i, 1);
            continue;
        }
        
        // Apply effects to alive players
        const alivePlayer = effect.caster === player1 ? player2 : player1;
        if (alivePlayer.isDead) continue;
        
        switch(effect.type) {
            case 'ice_platform':
                // Ice platform - can be jumped on but is slippery
                if (checkCollision(alivePlayer, effect)) {
                    // Landing on top
                    if (alivePlayer.velocityY > 0 && alivePlayer.y < effect.y) {
                        alivePlayer.y = effect.y - alivePlayer.height;
                        alivePlayer.velocityY = 0;
                        alivePlayer.onGround = true;
                    }
                    // Make it slippery when on platform (reduce friction)
                    if (alivePlayer.onGround && alivePlayer.y >= effect.y - alivePlayer.height - 5) {
                        alivePlayer.velocityX *= 0.92; // Very slippery
                    }
                }
                break;
                
            case 'wind_push':
                // Wind push - pushes player away
                if (checkCollision(alivePlayer, effect)) {
                    alivePlayer.velocityX += effect.forceX * 0.1;
                    alivePlayer.velocityY -= 0.5; // Slight upward force
                }
                break;
                
            case 'slippery_floor':
                // Slippery floor - reduces friction
                if (checkCollision(alivePlayer, effect)) {
                    if (alivePlayer.onGround) {
                        alivePlayer.velocityX *= 0.9; // Very slippery
                    }
                }
                break;
                
            case 'temp_obstacle':
                // Temporary obstacle - damages player
                if (checkCollision(alivePlayer, effect)) {
                    alivePlayer.health -= effect.damage * 0.1;
                    if (alivePlayer.health <= 0) {
                        alivePlayer.health = 0;
                    }
                    // Push away
                    const centerX = effect.x + effect.width / 2;
                    const playerCenterX = alivePlayer.x + alivePlayer.width / 2;
                    if (playerCenterX < centerX) {
                        alivePlayer.x -= 5;
                    } else {
                        alivePlayer.x += 5;
                    }
                }
                break;
        }
    }
}

// Draw ghost effects
function drawGhostEffects() {
    for (let effect of ghostEffects) {
        ctx.save();
        
        switch(effect.type) {
            case 'ice_platform':
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = '#87ceeb';
                ctx.fillRect(effect.x, effect.y, effect.width, effect.height);
                ctx.strokeStyle = '#4682b4';
                ctx.lineWidth = 2;
                ctx.strokeRect(effect.x, effect.y, effect.width, effect.height);
                // Draw ice pattern
                ctx.strokeStyle = '#b0e0e6';
                for (let i = 0; i < effect.width; i += 20) {
                    ctx.beginPath();
                    ctx.moveTo(effect.x + i, effect.y);
                    ctx.lineTo(effect.x + i, effect.y + effect.height);
                    ctx.stroke();
                }
                break;
                
            case 'wind_push':
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = '#e0e0e0';
                ctx.fillRect(effect.x, effect.y, effect.width, effect.height);
                // Draw wind lines
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.moveTo(effect.x + i * 40, effect.y);
                    ctx.lineTo(effect.x + i * 40 + 20, effect.y + effect.height);
                    ctx.stroke();
                }
                break;
                
            case 'slippery_floor':
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = '#ff69b4';
                ctx.fillRect(effect.x, effect.y, effect.width, effect.height);
                // Draw slippery pattern
                ctx.strokeStyle = '#ff1493';
                for (let i = 0; i < effect.width; i += 30) {
                    ctx.beginPath();
                    ctx.moveTo(effect.x + i, effect.y);
                    ctx.lineTo(effect.x + i + 15, effect.y + effect.height);
                    ctx.stroke();
                }
                break;
                
            case 'temp_obstacle':
                ctx.globalAlpha = 0.7;
                ctx.fillStyle = '#8b0000';
                ctx.fillRect(effect.x, effect.y, effect.width, effect.height);
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
                ctx.strokeRect(effect.x, effect.y, effect.width, effect.height);
                // Draw warning symbol
                ctx.fillStyle = '#fff';
                ctx.font = '20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('!', effect.x + effect.width/2, effect.y + effect.height/2 + 7);
                break;
        }
        
        ctx.restore();
    }
}

// Handle ghost ability input
function handleGhostAbility(player, abilityKey) {
    if (!player.isDead) return false; // Only dead players can use abilities
    if (player.ghostCooldown > 0) return false; // Still on cooldown
    
    const alivePlayer = player === player1 ? player2 : player1;
    if (alivePlayer.isDead) return false; // Both dead, no effect
    
    // Random ability type
    const abilityTypes = Object.values(GHOST_ABILITY_TYPES);
    const randomType = abilityTypes[Math.floor(Math.random() * abilityTypes.length)];
    
    // Create effect near alive player
    createGhostEffect(randomType, alivePlayer.x, alivePlayer.y, player);
    
    // Set cooldown
    player.ghostCooldown = GHOST_COOLDOWN;
    
    return true;
}

// Create blood particles
function createBloodParticles(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const speed = 2 + Math.random() * 3;
        bloodParticles.push({
            x: x,
            y: y,
            velocityX: Math.cos(angle) * speed,
            velocityY: Math.sin(angle) * speed,
            life: 1.0,
            decay: 0.02 + Math.random() * 0.02,
            size: 3 + Math.random() * 4,
            color: `rgba(${200 + Math.random() * 55}, 0, 0, 1)`
        });
    }
}

// Update blood particles
function updateBloodParticles() {
    for (let i = bloodParticles.length - 1; i >= 0; i--) {
        const particle = bloodParticles[i];
        particle.x += particle.velocityX;
        particle.y += particle.velocityY;
        particle.velocityY += 0.3; // gravity
        particle.life -= particle.decay;
        
        if (particle.life <= 0) {
            bloodParticles.splice(i, 1);
        }
    }
}

// Draw blood particles
function drawBloodParticles() {
    for (let particle of bloodParticles) {
        ctx.save();
        ctx.globalAlpha = particle.life;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Keys
const keys = {};

// Initialize first level
function initLevel() {
    platforms = [];
    enemies = [];
    collectibles = [];
    obstacles = [];
    movingPlatforms = [];
    
    const levelLength = 2000 + (gameState.level - 1) * 500; // เพิ่มความยาวตาม level
    levelWidth = levelLength;
    
    // Starting platform
    platforms.push({ x: 0, y: canvas.height - 100, width: 150, height: 30 });
    
    let currentX = 150;
    const baseY = canvas.height - 100;
    let currentY = baseY;
    const sectionCount = 8 + gameState.level * 2;
    
    // สร้างด่านแบบ obby - ปรับระยะห่างให้ใกล้กันมากขึ้น
    for (let section = 0; section < sectionCount && currentX < levelLength - 200; section++) {
        const sectionType = Math.floor(Math.random() * 5);
        // ลด gap ให้ใกล้กันมากขึ้น (จาก 80-180 เป็น 50-100)
        const gap = 50 + Math.random() * 50;
        
        switch(sectionType) {
            case 0: // กระโดดข้ามช่องว่าง
                currentY = baseY - Math.random() * 80; // ลดความสูง
                platforms.push({ 
                    x: currentX, 
                    y: currentY, 
                    width: 120 + Math.random() * 60, 
                    height: 30 
                });
                currentX += platforms[platforms.length - 1].width + gap;
                break;
                
            case 1: // กระโดดขึ้นลง
                const stepHeight = 50 + Math.random() * 30; // ลดความสูง
                for (let step = 0; step < 3; step++) {
                    platforms.push({ 
                        x: currentX, 
                        y: currentY - step * stepHeight, 
                        width: 100, 
                        height: 30 
                    });
                    currentX += 100; // ลดระยะห่างระหว่าง steps
                }
                currentX += gap;
                currentY = baseY;
                break;
                
            case 2: // Moving platform
                const movingY = baseY - 80 - Math.random() * 100; // ลดความสูง
                movingPlatforms.push({
                    x: currentX,
                    y: movingY,
                    width: 100,
                    height: 20,
                    startX: currentX,
                    endX: currentX + 150, // ลดระยะ
                    speed: 2 + gameState.difficulty * 0.3,
                    direction: 1,
                    type: 'horizontal'
                });
                platforms.push({ 
                    x: currentX + 180, // ลดระยะห่าง
                    y: currentY, 
                    width: 120, 
                    height: 30 
                });
                currentX += 320; // ลดระยะรวม
                break;
                
            case 3: // Spikes section
                platforms.push({ 
                    x: currentX, 
                    y: currentY, 
                    width: 150, 
                    height: 30 
                });
                // เพิ่ม spikes - ลดจำนวนและเพิ่มระยะห่าง
                const spikeCount = 2; // ลดจาก 3 เป็น 2
                for (let i = 0; i < spikeCount; i++) {
                    obstacles.push({
                        x: currentX + 40 + i * 50, // เพิ่มระยะห่างจาก 30 เป็น 50
                        y: currentY - 20,
                        width: 20,
                        height: 20,
                        type: 'spike',
                        damage: 5
                    });
                }
                currentX += 180; // ลดระยะ
                break;
                
            case 4: // Vertical moving platform
                const vertY = baseY - 120; // ลดความสูง
                movingPlatforms.push({
                    x: currentX,
                    y: vertY,
                    width: 100,
                    height: 20,
                    startY: vertY,
                    endY: vertY - 80, // ลดระยะ
                    speed: 1.5 + gameState.difficulty * 0.2,
                    direction: 1,
                    type: 'vertical'
                });
                platforms.push({ 
                    x: currentX + 120, // ลดระยะห่าง
                    y: currentY, 
                    width: 120, 
                    height: 30 
                });
                currentX += 250; // ลดระยะรวม
                break;
        }
    }
    
    // Final platform before goal
    const finalPlatformX = levelLength - 200;
    platforms.push({ 
        x: finalPlatformX, 
        y: baseY - 50, 
        width: 150, 
        height: 30 
    });
    
    // Platform for goal
    platforms.push({ 
        x: finalPlatformX + 150, 
        y: baseY - 50, 
        width: 100, 
        height: 30 
    });
    
    // Create goal at the end of platforms
    goal = {
        x: finalPlatformX + 200,
        y: baseY - 100,
        width: 50,
        height: 50,
        color: '#00ff00'
    };
    
    // เพิ่ม obstacles ตาม level (ไม่ให้ทับกัน) - ลดจำนวนให้พอดี
    const obstacleCount = Math.min(3 + gameState.level, 8); // จำกัดสูงสุดที่ 8 ตัว
    const usedPlatforms = new Set();
    const obstaclePositions = [];
    
    for (let i = 0; i < obstacleCount; i++) {
        let attempts = 0;
        let placed = false;
        
        while (!placed && attempts < 50) {
            attempts++;
            const platformIndex = Math.floor(Math.random() * (platforms.length - 2)) + 1;
            const platform = platforms[platformIndex];
            
            if (!platform || platform.x >= levelLength - 300) continue;
            if (usedPlatforms.has(platformIndex)) continue;
            
            // ตรวจสอบว่า platform มีพื้นที่เพียงพอ (อย่างน้อย 80px)
            if (platform.width < 80) continue;
            
            // เลือกตำแหน่งที่เหลือพื้นที่ให้ผู้เล่นกระโดดได้
            const minX = platform.x + 30; // เพิ่มระยะห่างจากขอบซ้าย
            const maxX = platform.x + platform.width - 60; // เพิ่มระยะห่างจากขอบขวา
            
            if (maxX <= minX) continue;
            
            const obstacleX = minX + Math.random() * (maxX - minX);
            const obstacleWidth = 25;
            
            // ตรวจสอบว่าไม่ทับกับ obstacles อื่นๆ - เพิ่มระยะห่าง
            let overlap = false;
            for (let existing of obstaclePositions) {
                if (existing.platformIndex === platformIndex) {
                    const distance = Math.abs(existing.x - obstacleX);
                    if (distance < obstacleWidth + 50) { // เพิ่มระยะห่างขั้นต่ำจาก 30px เป็น 50px
                        overlap = true;
                        break;
                    }
                }
            }
            
            if (!overlap) {
                const obstacleType = Math.random() > 0.5 ? 'saw' : 'spike';
                obstacles.push({
                    x: obstacleX,
                    y: platform.y - 25,
                    width: obstacleWidth,
                    height: 25,
                    type: obstacleType,
                    damage: obstacleType === 'spike' ? 5 : 3,
                    rotation: 0,
                    rotationSpeed: 0.1
                });
                obstaclePositions.push({ platformIndex, x: obstacleX });
                usedPlatforms.add(platformIndex);
                placed = true;
            }
        }
    }
    
    // เพิ่ม enemies บน platforms (ไม่ให้ทับกับ obstacles)
    const enemyCount = 2 + Math.floor(gameState.level / 2);
    const enemyPlatforms = new Set();
    
    for (let i = 0; i < enemyCount; i++) {
        let attempts = 0;
        let placed = false;
        
        while (!placed && attempts < 50) {
            attempts++;
            const platformIndex = Math.floor(Math.random() * (platforms.length - 3)) + 1;
            const platform = platforms[platformIndex];
            
            if (!platform || platform.x >= levelLength - 300) continue;
            if (usedPlatforms.has(platformIndex) || enemyPlatforms.has(platformIndex)) continue;
            
            // ตรวจสอบว่า platform มีพื้นที่เพียงพอ
            if (platform.width < 100) continue;
            
            // ตรวจสอบว่าไม่ทับกับ obstacles
            let hasObstacle = false;
            for (let obstacle of obstacles) {
                if (obstacle.y === platform.y - 25 && 
                    obstacle.x >= platform.x && 
                    obstacle.x <= platform.x + platform.width) {
                    hasObstacle = true;
                    break;
                }
            }
            
            if (!hasObstacle) {
                enemies.push({
                    x: platform.x + platform.width / 2,
                    y: platform.y - 30,
                    width: 30,
                    height: 30,
                    speed: 1 + gameState.difficulty * 0.3,
                    direction: Math.random() > 0.5 ? 1 : -1,
                    color: '#ff0000',
                    health: 1,
                    platformX: platform.x,
                    platformWidth: platform.width
                });
                enemyPlatforms.add(platformIndex);
                placed = true;
            }
        }
    }
    
    // เพิ่ม collectibles
    const collectibleCount = 5 + gameState.level;
    for (let i = 0; i < collectibleCount; i++) {
        const platform = platforms[Math.floor(Math.random() * (platforms.length - 2)) + 1];
        if (platform && platform.x < levelLength - 300) {
            collectibles.push({
                x: platform.x + Math.random() * (platform.width - 30),
                y: platform.y - 40,
                width: 20,
                height: 20,
                collected: false,
                color: '#ffd700',
                bounce: 0,
                bounceSpeed: 0.1
            });
        }
    }
    
    // Reset player positions - แต่ไม่ reset isDead ถ้าผู้เล่นตายอยู่แล้ว
    const wasPlayer1Dead = player1.isDead;
    const wasPlayer2Dead = player2.isDead;
    
    player1.x = 50;
    player1.y = baseY - 50;
    player1.velocityX = 0;
    player1.velocityY = 0;
    // ถ้าผู้เล่นตายอยู่แล้ว ให้ยังคงตาย (specter)
    if (!wasPlayer1Dead) {
        player1.isDead = false;
    }
    
    player2.x = 50;
    player2.y = baseY - 50;
    player2.velocityX = 0;
    player2.velocityY = 0;
    // ถ้าผู้เล่นตายอยู่แล้ว ให้ยังคงตาย (specter)
    if (!wasPlayer2Dead) {
        player2.isDead = false;
    }
}

// Collision detection
function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// Update players
function updatePlayer(player, leftKey, rightKey, jumpKey) {
    // Horizontal movement
    if (keys[leftKey]) {
        player.velocityX = -player.speed;
    } else if (keys[rightKey]) {
        player.velocityX = player.speed;
    } else {
        player.velocityX *= friction;
    }
    
    // Jump
    if (keys[jumpKey] && player.onGround) {
        player.velocityY = player.jumpPower;
        player.onGround = false;
    }
    
    // Apply gravity
    player.velocityY += gravity;
    
    // Update position
    player.x += player.velocityX;
    player.y += player.velocityY;
    
    // Platform collision
    player.onGround = false;
    for (let platform of platforms) {
        if (checkCollision(player, platform)) {
            // Landing on top
            if (player.velocityY > 0 && player.y < platform.y) {
                player.y = platform.y - player.height;
                player.velocityY = 0;
                player.onGround = true;
            }
            // Hitting bottom
            else if (player.velocityY < 0 && player.y > platform.y + platform.height) {
                player.y = platform.y + platform.height;
                player.velocityY = 0;
            }
            // Side collision
            else {
                if (player.x < platform.x) {
                    player.x = platform.x - player.width;
                } else {
                    player.x = platform.x + platform.width;
                }
                player.velocityX = 0;
            }
        }
    }
    
    // Moving platform collision (check separately for proper physics)
    let onMovingPlatform = false;
    for (let mp of movingPlatforms) {
        if (checkCollision(player, mp)) {
            if (player.velocityY > 0 && player.y < mp.y) {
                player.y = mp.y - player.height;
                player.velocityY = 0;
                player.onGround = true;
                onMovingPlatform = true;
                // Move with platform
                if (mp.type === 'horizontal') {
                    player.x += mp.speed * mp.direction;
                } else if (mp.type === 'vertical') {
                    player.y += mp.speed * mp.direction;
                }
            }
        }
    }
    
    // Boundary collision (only vertical, horizontal is handled by level width)
    if (player.y < 0) {
        player.y = 0;
        player.velocityY = 0;
    }
    
    // Die if player falls off platform
    if (player.y + player.height > canvas.height && !player.isDead) {
        player.isDead = true;
        player.health = 0;
        // สร้างเลือดสาดเมื่อตาย
        createBloodParticles(player.x + player.width / 2, player.y + player.height / 2, 15);
    }
    
    // Reset if player goes out of bounds horizontally
    if (player.x < -100) {
        player.x = 50;
        player.y = canvas.height - 150;
        player.velocityX = 0;
        player.velocityY = 0;
    }
    
    // Collectible collision
    for (let collectible of collectibles) {
        if (!collectible.collected && checkCollision(player, collectible)) {
            collectible.collected = true;
            player.score += 10;
            player.health = Math.min(100, player.health + 5);
        }
    }
    
    // Obstacle collision - ให้ผู้เล่นสามารถเหยียบและกระโดดได้
    // obstacles ไม่ block การเคลื่อนที่หรือการกระโดด - ทำแค่ความเสียหาย
    for (let obstacle of obstacles) {
        if (checkCollision(player, obstacle)) {
            const playerBottom = player.y + player.height;
            const obstacleTop = obstacle.y;
            
            // ถ้าผู้เล่นเหยียบ obstacle (ผู้เล่นอยู่เหนือ obstacle)
            if (player.velocityY >= 0 && playerBottom > obstacleTop && player.y < obstacleTop + 15) {
                // ผู้เล่นเหยียบ obstacle - ทำความเสียหายเล็กน้อยแต่ยังกระโดดได้
                const oldHealth = player.health;
                player.health -= obstacle.damage * 0.1; // ลดความเสียหายเมื่อเหยียบ
                if (player.health <= 0) {
                    player.health = 0;
                }
                // สร้างเลือดสาดเมื่อโดน damage
                if (oldHealth > player.health) {
                    createBloodParticles(player.x + player.width / 2, player.y + player.height / 2, 5);
                }
                // ไม่ block การกระโดด - ผู้เล่นสามารถกระโดดได้ตามปกติจาก platform ที่อยู่ใต้
            } else {
                // ผู้เล่นชน obstacle จากด้านข้างหรือด้านล่าง - ทำความเสียหายเต็ม
                const oldHealth = player.health;
                player.health -= obstacle.damage;
                if (player.health <= 0) {
                    player.health = 0;
                }
                // สร้างเลือดสาดเมื่อโดน damage
                if (oldHealth > player.health) {
                    createBloodParticles(player.x + player.width / 2, player.y + player.height / 2, 8);
                }
                // Push player away เฉพาะด้านข้าง
                const centerX = obstacle.x + obstacle.width / 2;
                const playerCenterX = player.x + player.width / 2;
                
                if (playerCenterX < centerX) {
                    player.x -= 5;
                } else {
                    player.x += 5;
                }
                // ไม่ push ขึ้นลง - ให้ผู้เล่นสามารถกระโดดได้
            }
        }
    }
    
    // Enemy collision
    for (let enemy of enemies) {
        if (checkCollision(player, enemy)) {
            // Player on top of enemy
            if (player.velocityY > 0 && player.y < enemy.y) {
                enemy.health = 0;
                player.velocityY = -5; // Bounce
                player.score += 20;
                // สร้างเลือดสาดเมื่อกำจัด enemy
                createBloodParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 10);
            } else {
                // Player takes damage
                const oldHealth = player.health;
                player.health -= 0.5;
                if (player.health <= 0) {
                    player.health = 0;
                }
                // สร้างเลือดสาดเมื่อโดน damage
                if (oldHealth > player.health) {
                    createBloodParticles(player.x + player.width / 2, player.y + player.height / 2, 6);
                }
            }
        }
    }
    
    // Goal collision
    if (goal && checkCollision(player, goal)) {
        nextLevel();
    }
}

// Update moving platforms
function updateMovingPlatforms() {
    for (let mp of movingPlatforms) {
        if (mp.type === 'horizontal') {
            mp.x += mp.speed * mp.direction;
            if (mp.x <= mp.startX || mp.x >= mp.endX) {
                mp.direction *= -1;
            }
        } else if (mp.type === 'vertical') {
            mp.y += mp.speed * mp.direction;
            if (mp.y <= mp.endY || mp.y >= mp.startY) {
                mp.direction *= -1;
            }
        }
    }
}

// Update obstacles
function updateObstacles() {
    for (let obstacle of obstacles) {
        if (obstacle.type === 'saw') {
            obstacle.rotation += obstacle.rotationSpeed;
        }
    }
}

// Update collectibles
function updateCollectibles() {
    for (let collectible of collectibles) {
        if (!collectible.collected) {
            collectible.bounce += collectible.bounceSpeed;
            collectible.y += Math.sin(collectible.bounce) * 0.5;
        }
    }
}

// Update enemies
function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        
        if (enemy.health <= 0) {
            enemies.splice(i, 1);
            continue;
        }
        
        // Move back and forth on platform
        enemy.x += enemy.speed * enemy.direction;
        
        // Change direction at platform boundaries
        if (enemy.x <= enemy.platformX || enemy.x + enemy.width >= enemy.platformX + enemy.platformWidth) {
            enemy.direction *= -1;
        }
    }
}

// Next level
function nextLevel() {
    // เก็บสถานะการตายก่อนเปลี่ยนด่าน
    const wasPlayer1Dead = player1.isDead;
    const wasPlayer2Dead = player2.isDead;
    
    gameState.level++;
    gameState.difficulty = Math.min(10, 1 + gameState.level * 0.3);
    initLevel();
    
    // ถ้าผู้เล่นตายอยู่แล้ว ให้ยังคงตาย (specter)
    if (wasPlayer1Dead) {
        player1.isDead = true;
        player1.health = 0;
    }
    if (wasPlayer2Dead) {
        player2.isDead = true;
        player2.health = 0;
    }
    
    updateUI();
}

// Update UI
function updateUI() {
    document.getElementById('level').textContent = gameState.level;
    document.getElementById('score1').textContent = player1.score;
    document.getElementById('score2').textContent = player2.score;
    document.getElementById('health1').style.width = player1.health + '%';
    document.getElementById('health2').style.width = player2.health + '%';
    
    // Update ghost ability UI
    const ghostAbility1 = document.getElementById('ghostAbility1');
    const ghostAbility2 = document.getElementById('ghostAbility2');
    const cooldown1 = document.getElementById('cooldown1');
    const cooldown2 = document.getElementById('cooldown2');
    
    if (player1.isDead) {
        if (ghostAbility1) ghostAbility1.style.display = 'block';
        if (cooldown1) {
            const seconds = Math.ceil(player1.ghostCooldown / 60);
            cooldown1.textContent = seconds;
            cooldown1.style.color = seconds > 0 ? '#ff0000' : '#00ff00';
        }
    } else {
        if (ghostAbility1) ghostAbility1.style.display = 'none';
    }
    
    if (player2.isDead) {
        if (ghostAbility2) ghostAbility2.style.display = 'block';
        if (cooldown2) {
            const seconds = Math.ceil(player2.ghostCooldown / 60);
            cooldown2.textContent = seconds;
            cooldown2.style.color = seconds > 0 ? '#ff0000' : '#00ff00';
        }
    } else {
        if (ghostAbility2) ghostAbility2.style.display = 'none';
    }
    
    let difficultyText = 'ง่าย';
    if (gameState.difficulty >= 7) difficultyText = 'ยากมาก';
    else if (gameState.difficulty >= 5) difficultyText = 'ยาก';
    else if (gameState.difficulty >= 3) difficultyText = 'ปานกลาง';
    
    document.getElementById('difficulty').textContent = difficultyText;
    
    // Check game over
    if ((player1.isDead || player1.health <= 0) && (player2.isDead || player2.health <= 0)) {
        gameState.gameOver = true;
        showGameOver();
    }
}

// Show game over
function showGameOver() {
    const gameOverDiv = document.getElementById('gameOver');
    const winnerText = document.getElementById('winnerText');
    
    if (player1.score > player2.score) {
        winnerText.textContent = `${player1.name} ชนะ! คะแนน: ${player1.score}`;
    } else if (player2.score > player1.score) {
        winnerText.textContent = `${player2.name} ชนะ! คะแนน: ${player2.score}`;
    } else {
        winnerText.textContent = `เสมอกัน! คะแนน: ${player1.score}`;
    }
    
    gameOverDiv.style.display = 'block';
}

// Initialize game
function initGame() {
    // Reset game state
    gameState.level = 1;
    gameState.difficulty = 1;
    gameState.gameOver = false;
    player1.health = 100;
    player1.score = 0;
    player1.isDead = false;
    player2.health = 100;
    player2.score = 0;
    player2.isDead = false;
    
    initLevel();
    updateUI();
}

// Restart game
function restartGame() {
    // Get names from input fields
    const player1Input = document.getElementById('player1NameInput');
    const player2Input = document.getElementById('player2NameInput');
    
    if (player1Input) {
        player1.name = player1Input.value.trim() || 'ผู้เล่น 1';
    }
    if (player2Input) {
        player2.name = player2Input.value.trim() || 'ผู้เล่น 2';
    }
    
    gameState.level = 1;
    gameState.difficulty = 1;
    gameState.gameOver = false;
    player1.health = 100;
    player1.score = 0;
    player1.isDead = false;
    player2.health = 100;
    player2.score = 0;
    player2.isDead = false;
    document.getElementById('gameOver').style.display = 'none';
    initLevel();
    updateUI();
}

// Draw functions
function drawPlayer(player) {
    if (player.isDead) {
        // Draw dead player (grayed out)
        ctx.fillStyle = '#666';
        ctx.fillRect(player.x, player.y, player.width, player.height);
        ctx.fillStyle = '#000';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('X', player.x + player.width/2, player.y + player.height/2 + 7);
        return;
    }
    
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
    
    // Eyes
    ctx.fillStyle = '#000';
    ctx.fillRect(player.x + 8, player.y + 10, 5, 5);
    ctx.fillRect(player.x + 27, player.y + 10, 5, 5);
}

function drawPlatform(platform) {
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 2;
    ctx.strokeRect(platform.x, platform.y, platform.width, platform.height);
    
    // Add texture
    ctx.fillStyle = '#a0522d';
    for (let i = 0; i < platform.width; i += 20) {
        ctx.fillRect(platform.x + i, platform.y, 2, platform.height);
    }
}

function drawMovingPlatform(mp) {
    ctx.fillStyle = '#4169e1';
    ctx.fillRect(mp.x, mp.y, mp.width, mp.height);
    ctx.strokeStyle = '#0000cd';
    ctx.lineWidth = 2;
    ctx.strokeRect(mp.x, mp.y, mp.width, mp.height);
    
    // Draw arrows to show movement
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    if (mp.type === 'horizontal') {
        ctx.fillText('↔', mp.x + mp.width/2, mp.y + mp.height/2 + 4);
    } else {
        ctx.fillText('↕', mp.x + mp.width/2, mp.y + mp.height/2 + 4);
    }
}

function drawObstacle(obstacle) {
    if (obstacle.type === 'spike') {
        ctx.fillStyle = '#8b0000';
        ctx.beginPath();
        ctx.moveTo(obstacle.x + obstacle.width/2, obstacle.y + obstacle.height);
        ctx.lineTo(obstacle.x, obstacle.y);
        ctx.lineTo(obstacle.x + obstacle.width, obstacle.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.stroke();
    } else if (obstacle.type === 'saw') {
        ctx.save();
        ctx.translate(obstacle.x + obstacle.width/2, obstacle.y + obstacle.height/2);
        ctx.rotate(obstacle.rotation);
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.arc(0, 0, obstacle.width/2, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw saw teeth
        ctx.fillStyle = '#ff0000';
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(
                Math.cos(angle) * obstacle.width/2,
                Math.sin(angle) * obstacle.width/2
            );
            ctx.lineTo(
                Math.cos(angle + 0.2) * obstacle.width/2.5,
                Math.sin(angle + 0.2) * obstacle.width/2.5
            );
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }
}

function drawEnemy(enemy) {
    ctx.fillStyle = enemy.color;
    ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
    
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(enemy.x + 5, enemy.y + 5, 5, 5);
    ctx.fillRect(enemy.x + 20, enemy.y + 5, 5, 5);
}

function drawCollectible(collectible) {
    if (collectible.collected) return;
    
    const centerX = collectible.x + collectible.width/2;
    const centerY = collectible.y + collectible.height/2;
    
    // Glow effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = collectible.color;
    
    ctx.fillStyle = collectible.color;
    ctx.beginPath();
    ctx.arc(centerX, centerY, collectible.width/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Star shape
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - collectible.width/3);
    for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI / 5) - Math.PI / 2;
        const x = centerX + Math.cos(angle) * collectible.width/3;
        const y = centerY + Math.sin(angle) * collectible.width/3;
        ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    
    ctx.shadowBlur = 0;
}

function drawGoal() {
    if (!goal) return;
    
    goalPulse += 0.1;
    const pulseSize = Math.sin(goalPulse) * 5 + 10;
    
    // Glow effect with pulse
    ctx.shadowBlur = pulseSize;
    ctx.shadowColor = goal.color;
    
    // Draw flag pole
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(goal.x + goal.width/2 - 3, goal.y + goal.height, 6, 50);
    
    // Draw flag
    ctx.fillStyle = goal.color;
    ctx.beginPath();
    ctx.moveTo(goal.x + goal.width/2, goal.y);
    ctx.lineTo(goal.x + goal.width, goal.y + goal.height/2);
    ctx.lineTo(goal.x + goal.width/2, goal.y + goal.height);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = '#00cc00';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Draw checkered pattern
    ctx.fillStyle = '#fff';
    ctx.fillRect(goal.x + goal.width/2 + 5, goal.y + 5, 10, 10);
    ctx.fillRect(goal.x + goal.width/2 + 5, goal.y + 20, 10, 10);
    
    ctx.shadowBlur = 0;
    
    // Draw text with pulse
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GOAL', goal.x + goal.width/2, goal.y - 10);
    
    // Draw glow circle
    ctx.strokeStyle = goal.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(goal.x + goal.width/2, goal.y + goal.height/2, goal.width/2 + pulseSize/2, 0, Math.PI * 2);
    ctx.stroke();
}

function draw() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate camera offset (follow players that are alive)
    let cameraX = 0;
    if (player1.isDead && !player2.isDead) {
        // Follow player 2 only
        cameraX = Math.max(0, Math.min(player2.x - canvas.width / 2, levelWidth - canvas.width));
    } else if (player2.isDead && !player1.isDead) {
        // Follow player 1 only
        cameraX = Math.max(0, Math.min(player1.x - canvas.width / 2, levelWidth - canvas.width));
    } else if (!player1.isDead && !player2.isDead) {
        // Follow average of both players
        const avgX = (player1.x + player2.x) / 2;
        cameraX = Math.max(0, Math.min(avgX - canvas.width / 2, levelWidth - canvas.width));
    } else {
        // Both dead - keep last position
        const avgX = (player1.x + player2.x) / 2;
        cameraX = Math.max(0, Math.min(avgX - canvas.width / 2, levelWidth - canvas.width));
    }
    
    ctx.save();
    ctx.translate(-cameraX, 0);
    
    // Draw platforms
    for (let platform of platforms) {
        drawPlatform(platform);
    }
    
    // Draw moving platforms
    for (let mp of movingPlatforms) {
        drawMovingPlatform(mp);
    }
    
    // Draw obstacles
    for (let obstacle of obstacles) {
        drawObstacle(obstacle);
    }
    
    // Draw collectibles
    for (let collectible of collectibles) {
        drawCollectible(collectible);
    }
    
    // Draw enemies
    for (let enemy of enemies) {
        drawEnemy(enemy);
    }
    
    // Draw goal
    drawGoal();
    
    // Draw players
    drawPlayer(player1);
    drawPlayer(player2);
    
    // Draw blood particles
    drawBloodParticles();
    
    // Draw ghost effects
    drawGhostEffects();
    
    // Draw death messages (inside camera transform)
    if (player1.isDead) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ตาย!', player1.x + player1.width/2, player1.y - 10);
    }
    if (player2.isDead) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ตาย!', player2.x + player2.width/2, player2.y - 10);
    }
    
    ctx.restore();
    
    // Draw UI overlay (not affected by camera)
    drawUIOverlay();
}

function drawUIOverlay() {
    // Draw minimap or progress bar
    const progress = Math.min(1, (player1.x + player2.x) / 2 / levelWidth);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(10, canvas.height - 30, 200, 10);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(10, canvas.height - 30, 200 * progress, 10);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, canvas.height - 30, 200, 10);
}

// Game loop
function gameLoop() {
    if (!gameState.gameOver && !gameState.paused) {
        // Update moving platforms
        updateMovingPlatforms();
        
        // Update obstacles
        updateObstacles();
        
        // Update collectibles
        updateCollectibles();
        
        // Update blood particles
        updateBloodParticles();
        
        // Update ghost effects
        updateGhostEffects();
        
        // Update ghost cooldowns
        if (player1.ghostCooldown > 0) {
            player1.ghostCooldown--;
        }
        if (player2.ghostCooldown > 0) {
            player2.ghostCooldown--;
        }
        
        // Handle ghost abilities (Space for player 1, Enter for player 2)
        // Only trigger once per key press
        if (keys['Space'] && player1.isDead && !player1.ghostAbilityUsed) {
            handleGhostAbility(player1, 'Space');
            player1.ghostAbilityUsed = true;
        }
        if (!keys['Space']) {
            player1.ghostAbilityUsed = false;
        }
        
        if (keys['Enter'] && player2.isDead && !player2.ghostAbilityUsed) {
            handleGhostAbility(player2, 'Enter');
            player2.ghostAbilityUsed = true;
        }
        if (!keys['Enter']) {
            player2.ghostAbilityUsed = false;
        }
        
        // Update players (only if not dead)
        if (!player1.isDead) {
            updatePlayer(player1, 'KeyA', 'KeyD', 'KeyW');
        }
        if (!player2.isDead) {
            updatePlayer(player2, 'ArrowLeft', 'ArrowRight', 'ArrowUp');
        }
        
        // Update enemies
        updateEnemies();
        
        // Update UI
        updateUI();
    }
    
    // Draw everything
    draw();
    
    requestAnimationFrame(gameLoop);
}

// Start game loop
gameLoop();

// Event listeners
document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    e.preventDefault();
});

document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    e.preventDefault();
});

// Initialize game - show name input modal first
// Don't start game loop until names are entered

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', function() {
    const player1Input = document.getElementById('player1NameInput');
    const player2Input = document.getElementById('player2NameInput');
    
    // Set default values
    if (player1Input) {
        if (!player1Input.value) {
            player1Input.value = 'ผู้เล่น 1';
        }
        player1.name = player1Input.value;
        
        // Update player name when input changes
        player1Input.addEventListener('input', function() {
            player1.name = this.value.trim() || 'ผู้เล่น 1';
        });
        
        // Select text when focused
        player1Input.addEventListener('focus', function() {
            this.select();
        });
    }
    
    if (player2Input) {
        if (!player2Input.value) {
            player2Input.value = 'ผู้เล่น 2';
        }
        player2.name = player2Input.value;
        
        // Update player name when input changes
        player2Input.addEventListener('input', function() {
            player2.name = this.value.trim() || 'ผู้เล่น 2';
        });
        
        // Select text when focused
        player2Input.addEventListener('focus', function() {
            this.select();
        });
    }
    
    // Initialize and start game
    initGame();
});
