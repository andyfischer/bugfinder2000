
import * as Crypto from 'crypto'
import { QueryLike } from '../../Query'
import { Graph } from '../../Graph'

interface ManifestFile {
    shortFilename: string
    hashedFilename: string
    buffer?: Buffer
    hash: string
}

interface SourceFile {
    fetch: QueryLike
    shortFilename: string
}

interface CurrentManifest {
    files: { [ shortFilename: string]: ManifestFile }
}

function filenameExtensionSplit(path: string) {
    const pos = path.lastIndexOf(".");

    if (pos < 0)
        return [ path, '' ];

    return [ path.slice(0, pos), path.slice(pos + 1) ];
}

export class StaticFileManifest {
    graph: Graph

    sourceFiles: SourceFile[] = []
    cache: Map<string, ManifestFile> = new Map()

    constructor(graph: Graph) {
        this.graph = graph
    }

    add(source: SourceFile) {
        this.sourceFiles.push(source);
    }

    async getOneFile(source: SourceFile): Promise<ManifestFile> {
        const buffer: Buffer = (await this.graph.query(source.fetch)).one().get('contents');

        console.log('got buffer: ', buffer);

        const hash = Crypto.createHash('sha256');

        const [ beforeExtension, extension ] = filenameExtensionSplit(source.shortFilename);
        hash.update(buffer);
        const hashStr = hash.digest('hex').substring(0, 16);

        let hashedFilename = beforeExtension + "." + hashStr;
        if (extension)
            hashedFilename += '.' + extension;

        if (this.cache.has(hashedFilename))
            return this.cache.get(hashedFilename);

        console.log(`loaded new file: ${source.shortFilename} (${hashStr})`);

        const file: ManifestFile = {
            shortFilename: source.shortFilename,
            hashedFilename,
            buffer,
            hash: hashStr,
        }

        this.cache.set(hashedFilename, file);
        return file;
    }

    async getManifest(): Promise<CurrentManifest> {

        const result: CurrentManifest = {
            files: {}
        }

        await Promise.all(this.sourceFiles.map(async (sourceFile: SourceFile) => {
            const file = await this.getOneFile(sourceFile);
            result.files[file.shortFilename] = {
                shortFilename: file.shortFilename,
                hashedFilename: file.hashedFilename,
                hash: file.hash,
            }
        }));

        return result;
    }
}
