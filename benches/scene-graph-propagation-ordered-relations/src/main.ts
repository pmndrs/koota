import {bench, group, run} from "mitata"
import { init } from './systems/init';
import { schedule } from './systems/schedule';
import { world } from "@bench/scene-graph-propagation"



group("scene-graph-propagation-ordered-relations", () => {
  init({ world });
  bench(``, () => {
    schedule.run({world})
  }).gc('inner');
})

await run()