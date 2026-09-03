import { resetState } from "../src/lib/store";

const state = resetState();
console.log(`Seeded ${state.shop.name}: ${state.customers.length} customers, ${state.slots.length} slots`);
