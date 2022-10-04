
import { MountPoint, MountPointSpec, pointSpecToDeclString } from './MountPoint'
import { Graph } from './Graph'
import { IDSourceNumber as IDSource } from './utils/IDSource'
import { ItemChangeListener } from './reactive/ItemChangeEvent'
import { Handler } from './Handler'

function hasSpecificValue(point: MountPointSpec) {
    for (const attr of Object.values(point.attrs))
        if (attr.specificValue)
            return true;
    return false;
}

export class Module {
    graph: Graph
    moduleId: string
    points: MountPoint[] = []
    pointIds = new IDSource()

    // Derived:
    pointsById: Map<number, MountPoint>
    pointsByDeclString: Map<string, MountPoint>

    constructor(graph: Graph) {
        this.graph = graph;
        this.moduleId = graph.nextModuleId.take();
    }

    /**
     * Replace existing moust list with a new list.
     */
    redefine(newSpecs: (MountPointSpec | Handler)[]) {

        const oldPoints = this.points;
        const newPoints = [];

        // Delete old derived state
        this.pointsById = new Map()
        this.pointsByDeclString = new Map()

        for (let pointSpec of newSpecs) {

            if (pointSpec.t === 'handler')
                pointSpec = pointSpec.toSpec();

            pointSpec = pointSpec as MountPointSpec;

            pointSpec.localId = pointSpec.localId || this.pointIds.take();

            if (this.pointsById.has(pointSpec.localId))
                throw new Error("module already has a point with id: " + pointSpec.localId);

            const point = new MountPoint(this.graph, pointSpec, this);
            newPoints.push(point);
            this.pointsById.set(pointSpec.localId, point);

            const declString = pointSpecToDeclString(pointSpec);
            if (this.pointsByDeclString.has(declString)) {
                throw new Error("module already has a point with decl: " + declString);
            }
            this.pointsByDeclString.set(declString, point);
        }

        this.points = newPoints;

        this.graph.onModuleChange();
        for (const listener of this.graph.schemaListeners) {
            this.sendUpdate(listener);
        }
    }

    clear() {
        this.redefine([]);
    }

    sendUpdate(listener: ItemChangeListener) {
        listener({
            verb: 'update',
            item: {
                id: this.moduleId,
                points: this.points,
            }
        });
    }
}

/*

notes and decision records:

A module is a set of mount points.

When setting up the module, we always deal with the points as an atomic list
(instead of having operations to add & remove individual points). This is
because the module contents often have hard interdependencies, and it would
be broken if we had one mount point calling an older version of another
mount point in the same module. When we redefine the entire list as a group,
we're always moving the graph from valid state -> to valid state.


*/
