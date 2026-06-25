// Public surface of the JointJS spike adapter. Workspace.tsx only needs
// `routeWires`; everything else stays an implementation detail of this
// folder. Keep the import boundary thin so removing the spike is a one-
// folder delete.

export { routeWires, _resetForTests } from "./router";
export type { RoutedPath } from "./router";
