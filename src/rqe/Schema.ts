
import { Table } from './Table'
import { Item } from './Item'
import { parseQueryTuple, parseTableDecl } from './parser'

export interface IndexConfiguration {
    attrs: string[]
    unique?: boolean | UniqueConstraintConfig
}

export type LooseIndexConfig = string | IndexConfiguration
export type IndexConfig = IndexConfiguration

export interface Reference {
    attr: string
    table?: Table
    foreignAttr?: string
    onDelete: OnDeleteOption
}

export interface UniqueConstraintConfig {
    onConflict: OnConflictOption
}

export type OnConflictOption = 'overwrite' | 'error' | 'drop_new'
export type OnDeleteOption = 'cascade' | 'set_null'
export type AttrGenerationMethod = 'increment' | 'random' | 'time_put'

export interface LooseAttrConfig {
    index?: boolean
    required?: boolean
    type?: string
    reference?: {
        onDelete: OnDeleteOption
    }
    foreignKey?: {
        table: Table
        foreignAttr: string
        onDelete?: OnDeleteOption
    }
    unique?: boolean | UniqueConstraintConfig
    generate?: boolean | {
        prefix?: string
        length?: number
        method: AttrGenerationMethod
    }
}

export interface AttrConfig {
    index?: boolean
    required?: boolean
    type?: string
    reference?: {
        onDelete: OnDeleteOption
    }
    foreignKey?: {
        table: Table
        foreignAttr: string
        onDelete?: OnDeleteOption
    }
    unique?: UniqueConstraintConfig
    generate?: {
        prefix?: string
        length?: number
        method: AttrGenerationMethod
    }
}

export type MountSpec = true | NamespaceMount 

export interface NamespaceMount {
    namespace: string
}

export interface TableSchema {
    name?: string
    mountAs?: string
    attrs?: { [attr: string]: AttrConfig }
    indexes?: IndexConfig[]
    references?: Reference[]
    foreignKeys?: Reference[]
    initialItems?: Item[]

    hint?: 'inmemory'
    funcs?: string[]
}

export interface LooseTableSchema {
    name?: string
    attrs?: string | { [attr: string]: LooseAttrConfig }
    mountAs?: string
    indexes?: LooseIndexConfig[]
    references?: Reference[]
    foreignKeys?: Reference[]
    initialItems?: Item[]

    hint?: 'inmemory'
    funcs?: string[]
}

export function findUniqueAttr(schema: TableSchema): [ string, AttrConfig ] | [] {
    for (const [attr, attrConfig] of Object.entries(schema.attrs)) {
        if (attrConfig.unique) {
            return [ attr, attrConfig ];
        }
    }

    return [];
}

export function parseLooseStringList(list: string | string[]): string[] {
    if (Array.isArray(list))
        return list;
    return list.split(' ');
}

export function fixLooseSchema(schema: LooseTableSchema): TableSchema {

    let attrs: { [key: string]: LooseAttrConfig };
    let indexes: IndexConfig[] = [];

    // parse attrs strings (if it's a string)
    if (typeof schema.attrs === 'string') {
        attrs = {};

        const parsed = parseQueryTuple(schema.attrs);

        for (const tag of parsed.tags) {
            attrs[tag.attr] = {};

            if (tag.value.t === 'query') {
                // Declared type for this attr.
                for (const nestedTag of tag.value.first().tags) {
                    if (nestedTag.attr === 'generated') {
                        attrs[tag.attr].generate = { method: 'increment' };
                    } else {
                        attrs[tag.attr].type = nestedTag.attr;
                    }
                }
            }
        }
    } else {
        attrs = schema.attrs || {};
    }

    for (const looseIndex of schema.indexes || []) {
        if (typeof looseIndex === 'string')
            indexes.push({ attrs: [looseIndex] });
        else 
            indexes.push(looseIndex);
    }

    function addIndex(attrs: string[]) {
        attrs.sort();

        // no-op if there's an existing index.
        for (const existing of indexes) {
            if ((existing.attrs+'') === (attrs+''))
                return;
        }

        indexes.push({attrs});
    }

    // Read the 'funcs' section and create attrs & indexes as needed.
    for (let funcDecl of schema.funcs || []) {

        const parsed = parseTableDecl(funcDecl);

        const indexedAttrs = [];
        for (const [ attr, attrConfig ] of Object.entries(parsed.attrs)) {

            if (attrs[attr] === undefined)
                attrs[attr] = {};

            if (attrConfig.isOutput === false || attrConfig.requiresValue)
                indexedAttrs.push(attr);
        }

        addIndex(indexedAttrs);
    }

    // Fill in defaults & missing data for each attr.
    for (const [attr, attrConfig] of Object.entries(attrs)) {

        const fixedConfig = {
            ...attrConfig
        }

        if (fixedConfig.unique === false)
            delete fixedConfig.unique;

        if (fixedConfig.unique === true)
            fixedConfig.unique = { onConflict: 'error' }

        if (fixedConfig.generate) {
            if (fixedConfig.generate === true)
                fixedConfig.generate = { method: 'increment' };

            if (!fixedConfig.unique) 
                fixedConfig.unique = { onConflict: 'error' };

            fixedConfig.index = true;
        }
        
        if (fixedConfig.unique) {
            fixedConfig.index = true;
        }

        attrs[attr] = fixedConfig;
    }

    return {
        ...schema,
        attrs,
        indexes,
    } as TableSchema;
}
