// マガキ (Magallana gigas): procedural individuals, clumps and reefs. See docs/models/oyster/README.md.
export { makeGenome, seedsFrom, gapeMillimetres, GROWTH_VARIANTS, type OysterGenome, type OysterSeeds, type AgeClass, type DeadState } from './genome';
export { OysterShape, buildOysterParts, buildOysterMerged, DETAIL, PART, type GeometryDetail, type OysterParts } from './geometry';
export { OysterAtlas } from './bake';
export { makeOysterMaterial, cloneOysterMaterial, oysterEnv, type OysterMaterial } from './material';
export { OysterBehavior, playerStimulus, type OysterState, type OysterSenses } from './behavior';
export { OysterIndividual, oysterMaterials, type OysterLod } from './OysterIndividual';
export { OysterCluster, layoutCluster, type ClusterMember } from './OysterCluster';
export { OysterReef, type ReefSite } from './OysterReef';
