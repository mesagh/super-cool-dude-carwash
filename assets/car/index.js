import wheel0 from './wheel-front-left.js';
import tire0 from './tire-front-left.js';
import wheel1 from './wheel-front-right.js';
import tire1 from './tire-front-right.js';
import wheel2 from './wheel-rear-left.js';
import tire2 from './tire-rear-left.js';
import wheel3 from './wheel-rear-right.js';
import tire3 from './tire-rear-right.js';
export const carParts = [
  { name: 'front-left', front: true, side: 1, wheel: wheel0, tire: tire0 },
  { name: 'front-right', front: true, side: -1, wheel: wheel1, tire: tire1 },
  { name: 'rear-left', front: false, side: 1, wheel: wheel2, tire: tire2 },
  { name: 'rear-right', front: false, side: -1, wheel: wheel3, tire: tire3 }
];
