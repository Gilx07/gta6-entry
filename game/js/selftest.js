// ?selftest=1: a 20-second scripted run through the real rules — walk, enter a car,
// drive, trigger wanted, pick up the M1 package, shoot a test rival — writing
// PASS/FAIL to the console and to document.title for automated verification.
import { nearestCar } from './vehicles.js';

const STEP = 1 / 60;

export function runSelfTest(G) {
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail: detail || '' });
    console.log(`SELFTEST ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  };
  const step = (n, input) => { for (let i = 0; i < n; i++) G.update(STEP, input || {}); };

  try {
    G.resetWorld(1);
    G.startGame();

    // 1. walk forward 3s
    const x0 = G.player.pos.x, z0 = G.player.pos.z;
    step(180, { f: true });
    const moved = Math.hypot(G.player.pos.x - x0, G.player.pos.z - z0);
    check('walk', moved > 5, `moved ${moved.toFixed(1)}m`);

    // 2. enter a parked car (road-aligned heading, so W drives along the street)
    const car = G.cars.find((c) => c.parked) || nearestCar(G, G.player.pos, 500);
    G.player.pos.set(car.pos.x + 2.5, 0, car.pos.z);
    const entered = G.enterCarAt(car, G.player.pos);
    check('enter-car', entered === true && G.player.inCar === car, entered ? 'in car' : 'enter failed');

    // 3. drive 5s
    const d0 = Math.hypot(G.player.pos.x, G.player.pos.z);
    step(300, { f: true });
    const drove = Math.hypot(G.player.pos.x, G.player.pos.z) - d0;
    check('drive', Math.abs(G.player.inCar.speed) > 3, `speed ${G.player.inCar.speed.toFixed(1)}`);

    // 4. crime -> wanted
    G.addCrime(1, 'Selftest crime');
    check('wanted', G.wanted >= 1, `wanted ${G.wanted}★`);

    // 5. police respond
    step(180, { f: true });
    check('police-spawn', G.policeCars.length >= 1, `${G.policeCars.length} pursuit cars`);

    // 6. exit car, walk to the M1 marker, pick up the package
    G.exitCar();
    G.player.pos.set(120, 0, -90);
    G.player.pos.x = 118; G.player.pos.z = -88;
    step(30, { f: true });
    check('mission-1', G.missions.index >= 1, `mission index ${G.missions.index}`);

    // 7. shooting: spawn a rival, aim, fire until it drops
    const rival = G.spawnTestRival();
    G.player.pos.set(rival.pos.x - 6, 0, rival.pos.z);
    G.player.yaw = Math.atan2(rival.pos.x - G.player.pos.x, rival.pos.z - G.player.pos.z);
    // camera forward is -(sin camYaw, cos camYaw): look toward the rival
    G.camYaw = G.player.yaw + Math.PI;
    G.player.ammo = 12;
    let shots = 0;
    while (!rival.dead && shots < 12) { G.tryShoot(); shots++; step(6, {}); }
    check('shoot', rival.dead === true, `rival ${rival.dead ? 'down' : 'alive'} after ${shots} shots, hp ${rival.health}`);

    // 8. HUD + save
    G.save();
    check('save', !!localStorage.getItem('vicebay-save'), 'localStorage written');

    const fails = results.filter((r) => !r.ok);
    const summary = fails.length === 0 ? 'SELFTEST PASS' : `SELFTEST FAIL: ${fails.map((f) => f.name).join(', ')}`;
    console.log(summary);
    document.title = summary;
    return fails.length === 0;
  } catch (e) {
    console.log(`SELFTEST FAIL exception — ${e.message}`);
    document.title = `SELFTEST FAIL: exception ${e.message}`;
    return false;
  }
}
