
export class ExpandJSON extends HTMLElement {
    data: any
    constructor(data: any) {
        super();
        this.data = data;
    }

    renderOpen() {
        this.innerHTML = `
        <div>
        <span class="mini-clickable clickable">JSON</span>
        <pre style="overflow-x: auto; white-space: pre-wrap; overflow-wrap: anywhere;">${JSON.stringify(this.data, null, 2).replaceAll('\n', '<br>')}</pre>
        </div>
        `;

        this.addEventListener('click', () => {
            this.renderClosed();
        });
    }

    renderClosed() {
        this.innerHTML = `
        <div>
        <span class="mini-clickable clickable">JSON</span>
        </div>
        `;

        this.addEventListener('click', () => {
            this.renderOpen();
        });
    }

    connectedCallback() {
        this.renderClosed();
    }
}

customElements.define('expand-json', ExpandJSON);
