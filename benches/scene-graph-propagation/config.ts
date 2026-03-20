export const CONFIG = {
    // total amount of desired entities
    targetEntityCount: 100000,
    // % of total entities that will be bottom level leaf objects
    bottomLeafFraction: 0.7,
    // how many available groups or objects will the next group be assigned
    groupChildrenCycle: [2, 5, 8, 13, 24],
    // sprinkle in leaves throughout the structure, not only at the bottom
    objectChildrenCycle: [0, 1, 0, 0, 3, 0, 0, 1],
    // % of entities that will get their "Value" every frame, causing everything below to have to be updated
    dirtyFraction: 0.01,
};