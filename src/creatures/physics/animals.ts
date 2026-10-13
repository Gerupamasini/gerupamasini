import type { Individual } from '../Individual';
import type { Driver } from '../drivers/Driver';
import { DRIVERS } from '../drivers/index';
import { Contacts, contactBody, type BodyBuild, type ContactBody, type ContactEnv } from './contacts';

/** a body of no particular build (a species whose driver gives none) */
const PLAIN: BodyBuild = { width: 0.25, height: 0.2 };

/** An animal as its host keeps it: the individual, its driver, and the body the contacts made for it. */
export interface Physical {
  readonly ind: Individual;
  readonly driver: Driver;
  body?: ContactBody;
}

/**
 * The contacts among one host's animals (the flat's, a tank's, the case's): each frame, after the drivers have moved
 * them, the bodies are read from the drivers, pushed apart, and the pushes handed back (Driver.nudge).
 */
export class AnimalContacts {
  readonly contacts = new Contacts();
  private readonly list: ContactBody[] = [];
  private readonly owners: Physical[] = [];

  /** `minDepth`: the water an animal must keep under it (a push never takes it out) */
  step(dt: number, animals: Iterable<Physical>, env: ContactEnv, minDepth?: (ind: Individual) => number): void {
    const list = this.list, owners = this.owners;
    list.length = owners.length = 0;
    for (const a of animals) {
      const ind = a.ind;
      const b = (a.body ??= contactBody(ind.id, DRIVERS[ind.species.model.driver ?? '']?.body ?? PLAIN, ind.length_mm / 1000, ind.weight_g));
      const st = a.driver.body?.();
      b.x = ind.pos.x;
      b.z = ind.pos.z;
      b.y = st ? st.y : ind.pos.y;
      b.heading = st ? st.heading : ind.heading;
      b.mode = st ? st.mode : 'bed';
      b.movable = !!a.driver.nudge;
      b.minDepth = minDepth ? minDepth(ind) : 0;
      list.push(b);
      owners.push(a);
    }
    this.contacts.step(dt, list, env);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.pushX !== 0 || b.pushZ !== 0) owners[i].driver.nudge?.(b.pushX, b.pushZ);
    }
  }
}
