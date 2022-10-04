
import { ErrorItem } from '../Errors'
import { ExpandJSON } from './ExpandJSON'

function errorTypeToMessage(type: string) {
    switch (type) {
    case 'no_table_found':
        return "No answer found for query";
    }
    return type;
}

function renderQueryStr(query: any) {
    if (typeof query !== 'string') {
        if (query.toQueryString)
            query = query.toQueryString();
        else
            console.log(`didn't understand`, query)
    }

    return `<span class="query-str">${query}</span>`
}


export class ErrorItemElement extends HTMLElement {
    item: ErrorItem

    constructor(item: ErrorItem) {
        super();

        this.item = item;
    //}

    //connectedCallback() {

        //const item = this.item;

        let contents = '';

        if (item.errorType === 'no_table_found') {

            if (item.errorType)
                contents += `
                  <div>
                    <span  class="error-type-primary">No answer found for query: </span>
                    ${renderQueryStr(this.item.fromQuery)}
                   </div>
                `;
        } else {

          if (item.fromQuery) {
            contents += `
            <div class="during-query-line">During query: ${renderQueryStr(this.item.fromQuery)}</div>
            `;
          }
        }


        if (item.stack)
            contents += `
          <div class="stack-trace-line">${this.item.stack.split('\n').map(line => `<div>${line}</div>`).join('')}</div>
          `;

        this.innerHTML = `
        <div class="error-item p-2">
          ${contents}
        </div>
        `;

        this.children[0].appendChild(new ExpandJSON(item));
    }
}

customElements.define('error-item', ErrorItemElement);
