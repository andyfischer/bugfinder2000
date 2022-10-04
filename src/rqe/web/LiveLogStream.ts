
import { Queryable } from '../Graph'
import { getGraphFromContext } from './helperFunctions'
import { Stream } from '../Stream'
import { ErrorItemElement } from './ErrorItem'
import { Item } from '../Item'
import { formatItem } from '../format/formatItem'

class LogItem extends HTMLElement {
    item: Item
    constructor(item: Item) {
        super();
        this.item = item
    }

    connectedCallback() {
        this.innerHTML = `
        <div class="log-item">
        ${formatItem(this.item)}
        </div>
        `
    }
}

export class LiveLogStream extends HTMLElement {
    graph: Queryable
    items: HTMLElement
    listenStream: Stream

    connectedCallback() {
        this.graph = getGraphFromContext(this);

        this.innerHTML = `
        <div class="items">
        </div>
        `;
        this.items = this.querySelector('.items');

        this.listenStream = this.graph.query(this.getAttribute('query'));

        this.listenStream.sendTo({
            receive: (msg) => {
                switch (msg.t) {
                case 'item': {
                    const item = msg.item;
                    this.items.appendChild(new LogItem(item));
                    break;
                }
                case 'error': {
                    const item = msg.item;
                    const line = new ErrorItemElement(item);
                    this.items.appendChild(line);
                    break;
                }
                }
            }
        });
    }

    disconnectedCallback() {
        if (this.listenStream) {
            this.listenStream.forceClose({errorType: 'element_hidden'});
            this.listenStream = null;
        }

    }
}

customElements.define('live-log-stream', LiveLogStream);
