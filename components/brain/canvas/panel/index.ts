/**
 * THE BRAIN — detail-panel barrel.
 *
 * Public surface for the canvas chrome agent: mount <DetailPanel/> in the right
 * column of the .brain-root grid. The sub-renderers are routed internally from
 * `view.selection`; they are exported for testing / direct use if needed.
 */

export { DetailPanel } from "./detail-panel";
export { SelPortfolio } from "./sel-portfolio";
export { SelSystem } from "./sel-system";
export { SelDomain } from "./sel-domain";
export { SelSurface, type SurfaceTarget } from "./sel-surface";
export { SelStation } from "./sel-station";
