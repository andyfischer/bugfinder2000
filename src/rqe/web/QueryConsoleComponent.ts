
import { Queryable } from '../Graph'
import { getGraph } from '../globalGraph'
import { IDSourceNumber as IDSource } from '../utils/IDSource'
import { Table } from '../Table'
import { get } from '../Item'
import { errorItemToString } from '../Errors'
import { getGraphFromContext } from './helperFunctions'

export class QueryConsoleComponent extends HTMLElement {
    graph: Queryable
    currentSubmitId: number
    nextSubmitId = new IDSource();

    connectedCallback() {
        this.graph = getGraphFromContext(this);

        this.innerHTML = `
        <div>
        <form>
          <input type="text" style="width: 400px; border: 2px solid grey; border-radius: 8px; padding: 4px;" placeholder="Enter query"></input>
        </form>
        <div class="results-panel">
        </div>
        </div>
        `;

        this.querySelector('form')
        .addEventListener('submit', (evt) => {
            evt.preventDefault();

            const submitId = this.nextSubmitId.take();

            const graph = this.graph || getGraph();
            const input = this.querySelector('input').value;
            const result = graph.query(input);

            console.log('running input: ', input);

            this.currentSubmitId = submitId;
            result.callback((table:Table) => {
                console.log('finished input');

                if (this.currentSubmitId !== submitId)
                    return;
                
                this.currentSubmitId = null;
                const resultsPanel = this.querySelector('.results-panel');

                if (table.hasError()) {
                    resultsPanel.innerHTML = `
                    <h1>Errors</h1>
                    ${ table.errors().list().map(error =>
                        `<div>${errorItemToString(error)}<div>`)}
                    `
                    return;
                }

                const attrs = table.getEffectiveAttrs();
                
                if (attrs.length === 0) {
                    resultsPanel.innerHTML = `
                    <h1>(no items)</h1>`
                    return;
                }

                const headerElements = [];
                for (const attr of attrs)
                    headerElements.push(`<div style="padding:2px;">${attr}</div>`);

                const gridElements = [];
                for (const item of table.scan())
                    for (const attr of attrs)
                        gridElements.push(`<div style="border: 1px solid grey; padding:2px;">${get(item, attr)}</div>`);

                resultsPanel.innerHTML = `
                <div class="results-grid" style="margin: 10px; display: grid; grid-template: auto / repeat(${attrs.length}, 1fr);">
                ${ headerElements.join('\n') }
                ${ gridElements.join('\n') }
                </div>
                `;

            });


        })
    }
}

customElements.define('query-console', QueryConsoleComponent);
