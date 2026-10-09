bump: minor

### Removed
- Per-user grouping in the viewer: the per-(machine, user) convex hulls, hull labels, hull colours, and the grouping legend are no longer drawn. Nodes are still coloured by agent status (`colors.js` unchanged) and `ownerSourceId` still ships in the graph data — it is just no longer rendered.
