
export type RopeNode = Rope | RopeSlice | RopeJoin

export class Rope {
    t = 'rope_leaf'
    str: string
    length: number

    constructor(s: string) {
        this.str = s;
        this.length = s.length;
    }

    delete(startAt: number, endAt: number) {
        return this.replace(startAt, endAt, new Rope(''));
    }

    replace(startAt: number, endAt: number, replacement: string | RopeNode) {
        replacement = toRope(replacement);

        let nodes: RopeNode[] = [];

        if (startAt > 0)
            nodes.push(new RopeSlice(this, 0, startAt));

        if (replacement.length > 0)
            nodes.push(replacement);

        if (endAt < this.length)
            nodes.push(new RopeSlice(this, endAt, this.length));

        return new RopeJoin(nodes);
    }

    slice(startAt: number, endAt: number) {
        return new RopeSlice(this, startAt, endAt);
    }

    toFlatString() {
        return this.str;
    }

    static slice(s: RopeNode | string, startAt: number, endAt: number) {
        s = toRope(s);
        return new RopeSlice(s, startAt, endAt);
    }

    static join(nodes: RopeNode[]) {
        return new RopeJoin(nodes);
    }
}


export class RopeSlice {
    t = 'rope_slice'
    node: RopeNode
    startAt: number
    endAt: number
    length: number

    constructor(node: RopeNode, startAt: number, endAt: number) {
        this.node = node;
        this.startAt = startAt;
        this.endAt = endAt;

        if (this.startAt < 0)
            this.startAt = 0;
        if (this.endAt > node.length)
            this.endAt = node.length;

        this.length = endAt - startAt;
    }

    toFlatString() {
        // future: if node is a RopeJoin then we might be able to skip out-of-bounds
        // child nodes when creating this substring.
        return this.node.toFlatString().slice(this.startAt, this.endAt);
    }
}

export class RopeJoin {
    t = 'rope_join'
    nodes: RopeNode[]
    length: number

    constructor(nodes: RopeNode[]) {
        this.nodes = nodes;
        this.length = 0
        for (const node of nodes)
            this.length += node.length;
    }

    toFlatString() {
        return this.nodes.map(node => node.toFlatString()).join("");
    }
}

function toRope(item: string | RopeNode) {
    if (typeof item === 'string')
        return new Rope(item);
    else
        return item as RopeNode;
}
