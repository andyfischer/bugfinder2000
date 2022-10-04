
import { Queryable } from '../Graph'
import { QueryConsoleComponent } from './QueryConsoleComponent'

const style = `
.app-frame {
    display: grid;
    grid-template:
        "left content" auto / 180px 1fr;
}

.app-left-sidebar {
    grid: 1/1;
    color: white;
    font-weight: 500;
    font-size: 18px;
    padding: .5rem;
    background-color: #1e81b0;
}

.app-content {
    grid: 1/2;
    padding: .5rem;
}

.error-item {
    border: 2px solid red;
}

.query-str {
    background: #eee;
    padding: .5rem;
    font-family: monospace;
    border-radius: 1rem;
}

.error-type-primary {
    font-size: 2rem;
}

.stack-trace-line {
    color: #888;
}

.stack-trace-line:first-child {
    color: black;
}

.mini-clickable {
    margin: 0.25rem;
    padding: 0.25rem;
    border: 1px solid grey;
}

.clickable {
    cursor: pointer;
}
`

class Dashboard5Main extends HTMLElement {
    graph: Queryable

    connectedCallback() {
        const graphContext = this.parentElement.closest('graph-context');

        if (!graphContext)
            throw new Error('<graph-context> not found');

        this.innerHTML = `
        <div>
          <style>${style}</style>
          <div class="app-frame">
            <div class="app-left-sidebar">
              <div>Logs</div>
            </div>
            <div class="app-content">
              <live-log-stream query="listen latest-logs data"></live-log-stream>
            </div>
          </div>
        </div>
        `
    }
}

customElements.define('dashboard5-main', Dashboard5Main);
