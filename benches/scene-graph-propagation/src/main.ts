import {bench, group, run} from "mitata"
import { init } from './systems/init';
import { schedule } from './systems/schedule';
import { world } from './world';



group("scene-graph-propagation", () => {
  init({ world });
  bench(``, () => {
    schedule.run({world})
  }).gc('inner');
})

await run()