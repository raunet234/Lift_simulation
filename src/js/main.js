/**
 * ELEVATE - Lift Simulation Engine
 * State management, SCAN scheduling algorithm, and dynamic UI controller.
 */

// Application Constants
const FLOOR_HEIGHT_PX = 100; // Matches --floor-height in CSS
const MOVE_TIME_MS = 2000;    // 2 seconds per floor movement
const DOOR_TIME_MS = 2500;    // 2.5s open, 2.5s close

// Application State
let numFloors = 0;
let numLifts = 0;
const lifts = [];          // Array of Lift objects
const globalQueue = [];    // Array of pending calls: { floor, direction }

/**
 * Lift Object Structure:
 * {
 *   id: number,
 *   currentFloor: number,      // Integer floor position
 *   targetFloors: Set<number>, // Unique floors this lift needs to visit
 *   state: 'idle' | 'moving' | 'doors',
 *   direction: 'up' | 'down' | 'none',
 *   element: HTMLElement,
 *   indicatorElement: HTMLElement,
 *   upArrowElement: HTMLElement,
 *   downArrowElement: HTMLElement,
 *   stepTimer: number | null,  // Timer for step-by-step movement
 *   doorTimer: number | null   // Timer for doors operations
 * }
 */

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
});

function setupEventListeners() {
  const setupForm = document.getElementById('setup-form');
  const btnReset = document.getElementById('btn-reset');

  if (setupForm) {
    setupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const floorsInput = document.getElementById('input-floors');
      const liftsInput = document.getElementById('input-lifts');
      
      const floors = parseInt(floorsInput.value);
      const liftsCount = parseInt(liftsInput.value);
      
      if (validateInputs(floors, liftsCount)) {
        initializeSimulation(floors, liftsCount);
      }
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', resetSimulation);
  }
}

function validateInputs(floors, liftsCount) {
  if (isNaN(floors) || floors < 2 || floors > 25) {
    alert('Please enter a valid number of floors between 2 and 25.');
    return false;
  }
  if (isNaN(liftsCount) || liftsCount < 1 || liftsCount > 10) {
    alert('Please enter a valid number of lifts between 1 and 10.');
    return false;
  }
  return true;
}

/**
 * Initialize Simulation Viewport
 */
function initializeSimulation(floors, liftsCount) {
  numFloors = floors;
  numLifts = liftsCount;
  
  // Update Stats
  document.getElementById('stat-floors').textContent = numFloors;
  document.getElementById('stat-lifts').textContent = numLifts;
  document.getElementById('stat-calls').textContent = '0';
  
  // Transition screens
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('sim-screen').classList.remove('hidden');
  
  // Generate Simulation DOM
  generateSimulationDOM();
  
  // Initialize Lift states
  initializeLiftsState();
}

/**
 * Reset Simulation to setup screen
 */
function resetSimulation() {
  // Clear all active timers
  lifts.forEach(lift => {
    if (lift.stepTimer) clearTimeout(lift.stepTimer);
    if (lift.doorTimer) clearTimeout(lift.doorTimer);
  });
  
  // Reset arrays
  lifts.length = 0;
  globalQueue.length = 0;
  
  // Toggle screens
  document.getElementById('sim-screen').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('hidden');
  
  // Clear container
  const container = document.getElementById('simulation-container');
  if (container) container.innerHTML = '';
}

/**
 * Dynamically build floors, tracks, and shafts
 */
function generateSimulationDOM() {
  const container = document.getElementById('simulation-container');
  if (!container) return;
  container.innerHTML = '';

  // 1. Create Floors list (rendered bottom-up via CSS flex-direction: column-reverse)
  for (let i = 0; i < numFloors; i++) {
    const floorRow = document.createElement('div');
    floorRow.className = 'floor-row';
    floorRow.style.height = `${FLOOR_HEIGHT_PX}px`;
    floorRow.dataset.floor = i;

    // Floor controls (left column)
    const floorControls = document.createElement('div');
    floorControls.className = 'floor-controls';

    const floorInfo = document.createElement('div');
    floorInfo.className = 'floor-info';
    
    const floorName = document.createElement('span');
    floorName.className = 'floor-name';
    floorName.textContent = i === 0 ? 'Ground' : `Floor ${i}`;

    const floorNumber = document.createElement('span');
    floorNumber.className = 'floor-number';
    floorNumber.textContent = `Lvl ${i}`;

    floorInfo.appendChild(floorName);
    floorInfo.appendChild(floorNumber);
    floorControls.appendChild(floorInfo);

    // Call buttons container
    const floorButtons = document.createElement('div');
    floorButtons.className = 'floor-buttons';

    // Up button (not on top floor)
    if (i < numFloors - 1) {
      const btnUp = document.createElement('button');
      btnUp.className = 'btn-call up';
      btnUp.innerHTML = '▲';
      btnUp.dataset.floor = i;
      btnUp.dataset.dir = 'up';
      btnUp.id = `btn-call-up-${i}`;
      btnUp.addEventListener('click', () => handleCall(i, 'up'));
      floorButtons.appendChild(btnUp);
    }

    // Down button (not on ground floor)
    if (i > 0) {
      const btnDown = document.createElement('button');
      btnDown.className = 'btn-call down';
      btnDown.innerHTML = '▼';
      btnDown.dataset.floor = i;
      btnDown.dataset.dir = 'down';
      btnDown.id = `btn-call-down-${i}`;
      btnDown.addEventListener('click', () => handleCall(i, 'down'));
      floorButtons.appendChild(btnDown);
    }

    floorControls.appendChild(floorButtons);
    floorRow.appendChild(floorControls);

    // Floor track area background
    const floorTrack = document.createElement('div');
    floorTrack.className = 'floor-track';
    floorRow.appendChild(floorTrack);

    container.appendChild(floorRow);
  }

  // 2. Overlay Shafts Container
  const shaftsContainer = document.createElement('div');
  shaftsContainer.className = 'shafts-container';
  
  for (let j = 0; j < numLifts; j++) {
    const shaft = document.createElement('div');
    shaft.className = 'shaft';
    shaft.style.width = `var(--lift-width)`;
    
    // Create Lift element
    const liftEl = document.createElement('div');
    liftEl.className = 'lift idle';
    liftEl.id = `lift-${j}`;
    // Position at bottom floor
    liftEl.style.transform = `translateY(0px)`;

    // Lift Control Panel (LED Floor indicator)
    const liftPanel = document.createElement('div');
    liftPanel.className = 'lift-panel';

    const liftIndicator = document.createElement('span');
    liftIndicator.className = 'lift-indicator-number';
    liftIndicator.id = `lift-indicator-${j}`;
    liftIndicator.textContent = '0';

    const directionIndicator = document.createElement('div');
    directionIndicator.className = 'direction-indicator';
    
    const upArrow = document.createElement('span');
    upArrow.className = 'lift-direction up';
    upArrow.textContent = '▲';

    const downArrow = document.createElement('span');
    downArrow.className = 'lift-direction down';
    downArrow.textContent = '▼';

    directionIndicator.appendChild(upArrow);
    directionIndicator.appendChild(downArrow);

    liftPanel.appendChild(liftIndicator);
    liftPanel.appendChild(directionIndicator);
    liftEl.appendChild(liftPanel);

    // Lift Doors Segment
    const doorsContainer = document.createElement('div');
    doorsContainer.className = 'lift-doors-container';

    const leftDoor = document.createElement('div');
    leftDoor.className = 'lift-door left-door';

    const rightDoor = document.createElement('div');
    rightDoor.className = 'lift-door right-door';

    doorsContainer.appendChild(leftDoor);
    doorsContainer.appendChild(rightDoor);
    liftEl.appendChild(doorsContainer);

    shaft.appendChild(liftEl);
    shaftsContainer.appendChild(shaft);
  }

  container.appendChild(shaftsContainer);
}

/**
 * Set up initial state objects for lifts
 */
function initializeLiftsState() {
  for (let j = 0; j < numLifts; j++) {
    const liftEl = document.getElementById(`lift-${j}`);
    const indicatorEl = document.getElementById(`lift-indicator-${j}`);
    const upArrowEl = liftEl.querySelector('.lift-direction.up');
    const downArrowEl = liftEl.querySelector('.lift-direction.down');

    lifts.push({
      id: j,
      currentFloor: 0,
      targetFloors: new Set(),
      state: 'idle',
      direction: 'none',
      element: liftEl,
      indicatorElement: indicatorEl,
      upArrowElement: upArrowEl,
      downArrowElement: downArrowEl,
      stepTimer: null,
      doorTimer: null
    });
  }
}

/**
 * Handle call button press
 */
function handleCall(floor, direction) {
  // Check if button is already active
  const button = document.getElementById(`btn-call-${direction}-${floor}`);
  if (button && button.classList.contains('active')) return;

  // Add visual active state
  if (button) button.classList.add('active');

  // Verify if a lift is already idle on this floor and can immediately open doors
  const immediateLift = lifts.find(lift => 
    lift.currentFloor === floor && 
    lift.state === 'idle'
  );

  if (immediateLift) {
    // Service immediately
    serviceFloor(immediateLift, floor, direction);
    return;
  }

  // Check if there is already a lift assigned/moving to this floor in the same direction
  const alreadyAssigned = lifts.some(lift => 
    lift.targetFloors.has(floor) && 
    (lift.direction === direction || lift.direction === 'none')
  );

  if (alreadyAssigned) {
    return;
  }

  // Queue request
  globalQueue.push({ floor, direction });
  updateCallsCounter();

  // Dispatch lifts to service queue
  dispatchLifts();
}

/**
 * Dispatch Controller Engine
 */
function dispatchLifts() {
  if (globalQueue.length === 0) return;

  // Iterate over global calls and find optimal lift
  for (let i = 0; i < globalQueue.length; i++) {
    const call = globalQueue[i];
    
    // Find closest idle lift
    let bestLift = null;
    let minDistance = Infinity;

    lifts.forEach(lift => {
      if (lift.state === 'idle') {
        const dist = Math.abs(lift.currentFloor - call.floor);
        if (dist < minDistance) {
          minDistance = dist;
          bestLift = lift;
        }
      }
    });

    // If we found an idle lift, assign the call to it
    if (bestLift) {
      globalQueue.splice(i, 1); // Remove call from queue
      i--; // Adjust index due to splice
      
      updateCallsCounter();
      
      // Assign target floor
      bestLift.targetFloors.add(call.floor);
      bestLift.state = 'moving';
      bestLift.direction = call.floor > bestLift.currentFloor ? 'up' : 'down';
      
      // Set moving indicator classes
      updateLiftStateClasses(bestLift);
      
      // Start moving
      moveLiftOneStep(bestLift);
    }
  }
}

/**
 * Move Lift one step (floor) closer to destination
 */
function moveLiftOneStep(lift) {
  if (lift.targetFloors.size === 0) {
    setLiftIdle(lift);
    return;
  }

  // Determine target direction based on SCAN algorithm
  const targets = Array.from(lift.targetFloors);
  const current = lift.currentFloor;
  
  let nextFloor = current;
  if (lift.direction === 'up') {
    // Check if there are any targets above
    const higherTargets = targets.filter(t => t > current);
    if (higherTargets.length > 0) {
      nextFloor = current + 1;
    } else {
      // Turn around
      lift.direction = 'down';
      const lowerTargets = targets.filter(t => t < current);
      if (lowerTargets.length > 0) {
        nextFloor = current - 1;
      }
    }
  } else if (lift.direction === 'down') {
    // Check if there are lower targets
    const lowerTargets = targets.filter(t => t < current);
    if (lowerTargets.length > 0) {
      nextFloor = current - 1;
    } else {
      // Turn around
      lift.direction = 'up';
      const higherTargets = targets.filter(t => t > current);
      if (higherTargets.length > 0) {
        nextFloor = current + 1;
      }
    }
  }

  // Edge case: direction was none, but we have targets
  if (lift.direction === 'none' && targets.length > 0) {
    const closestTarget = targets.reduce((prev, curr) => 
      Math.abs(curr - current) < Math.abs(prev - current) ? curr : prev
    );
    lift.direction = closestTarget > current ? 'up' : 'down';
    nextFloor = current + (closestTarget > current ? 1 : -1);
  }

  // If we shouldn't move (already at a target) - should not happen normally here, but safety fallback
  if (nextFloor === current) {
    arriveAtFloor(lift);
    return;
  }

  // Apply Transition classes and styles
  lift.element.style.transition = `transform ${MOVE_TIME_MS}ms linear`;
  lift.element.style.transform = `translateY(${-nextFloor * FLOOR_HEIGHT_PX}px)`;
  
  // Set moving state classes
  updateLiftStateClasses(lift);

  // Set timer to complete step
  lift.stepTimer = setTimeout(() => {
    lift.currentFloor = nextFloor;
    lift.indicatorElement.textContent = lift.currentFloor;
    
    // Check if we arrived at a requested floor
    const isTarget = lift.targetFloors.has(lift.currentFloor);
    
    // Support Incident stop optimization:
    // Check if there is a pending call at this current floor in our global queue that matches our moving direction
    const hasMatchingCall = globalQueue.some(call => 
      call.floor === lift.currentFloor && 
      (call.direction === lift.direction || lift.targetFloors.size === 1)
    );

    if (isTarget || hasMatchingCall) {
      arriveAtFloor(lift);
    } else {
      // Continue moving
      moveLiftOneStep(lift);
    }
  }, MOVE_TIME_MS);
}

/**
 * Handle Arrival at Floor
 */
function arriveAtFloor(lift) {
  lift.state = 'doors';
  lift.targetFloors.delete(lift.currentFloor);
  
  updateLiftStateClasses(lift);

  // Clear calls & buttons at this floor based on service direction
  if (lift.direction === 'up') {
    clearCall(lift.currentFloor, 'up');
    if (lift.targetFloors.size === 0) {
      clearCall(lift.currentFloor, 'down');
    }
  } else if (lift.direction === 'down') {
    clearCall(lift.currentFloor, 'down');
    if (lift.targetFloors.size === 0) {
      clearCall(lift.currentFloor, 'up');
    }
  } else {
    clearCall(lift.currentFloor, 'up');
    clearCall(lift.currentFloor, 'down');
  }

  // Trigger doors simulation sequence
  // 1. Doors Opening: add class doors-open (takes 2.5s via transition)
  lift.element.classList.add('doors-open');
  
  lift.doorTimer = setTimeout(() => {
    // 2. Doors finished opening, now trigger doors closing
    lift.element.classList.remove('doors-open');
    
    lift.doorTimer = setTimeout(() => {
      // 3. Doors finished closing
      lift.doorTimer = null;
      
      // Determine next actions
      if (lift.targetFloors.size > 0) {
        lift.state = 'moving';
        updateLiftStateClasses(lift);
        moveLiftOneStep(lift);
      } else {
        setLiftIdle(lift);
      }
    }, DOOR_TIME_MS);
  }, DOOR_TIME_MS);
}

/**
 * Service a floor immediately (for idle lift already at the floor)
 */
function serviceFloor(lift, floor, direction) {
  lift.state = 'doors';
  lift.direction = direction;
  updateLiftStateClasses(lift);
  
  clearCall(floor, direction);
  clearCall(floor, direction === 'up' ? 'down' : 'up');

  // Open doors
  lift.element.classList.add('doors-open');

  lift.doorTimer = setTimeout(() => {
    // Close doors
    lift.element.classList.remove('doors-open');

    lift.doorTimer = setTimeout(() => {
      lift.doorTimer = null;
      setLiftIdle(lift);
    }, DOOR_TIME_MS);
  }, DOOR_TIME_MS);
}

/**
 * Set a lift back to idle state
 */
function setLiftIdle(lift) {
  lift.state = 'idle';
  lift.direction = 'none';
  updateLiftStateClasses(lift);
  
  // See if there are pending jobs to tackle
  dispatchLifts();
}

/**
 * Update UI classes on Lift element based on state
 */
function updateLiftStateClasses(lift) {
  // Reset all status classes
  lift.element.classList.remove('idle', 'moving', 'doors-opening', 'doors-open', 'doors-closing', 'moving-up', 'moving-down');
  
  // Set base states
  if (lift.state === 'idle') {
    lift.element.classList.add('idle');
  } else if (lift.state === 'moving') {
    lift.element.classList.add('moving');
  } else if (lift.state === 'doors') {
    lift.element.classList.add('doors-opening');
  }
  
  // Set directions
  if (lift.direction === 'up') {
    lift.element.classList.add('moving-up');
  } else if (lift.direction === 'down') {
    lift.element.classList.add('moving-down');
  }
}

/**
 * Helper to remove a call from global queue and turn off glowing button
 */
function clearCall(floor, direction) {
  const index = globalQueue.findIndex(c => c.floor === floor && c.direction === direction);
  if (index !== -1) {
    globalQueue.splice(index, 1);
    updateCallsCounter();
  }
  
  const btn = document.getElementById(`btn-call-${direction}-${floor}`);
  if (btn) btn.classList.remove('active');
}

/**
 * Update calls counter in control bar
 */
function updateCallsCounter() {
  const statCalls = document.getElementById('stat-calls');
  if (statCalls) {
    statCalls.textContent = globalQueue.length;
  }
}
