
import { MountPoint } from './MountPoint'
import { QueryTuple } from './QueryTuple'

export function explainWhyQueryFails(tuple: QueryTuple, table: MountPoint) {
    const missingRequired: string[] = [];
    const missingRequiredValue: string[] = [];
    const extraAttrs: string[] = [];

    for (const tag of tuple.tags) {
        if (!table.has(tag.attr)) {
            extraAttrs.push(tag.attr);
        }
    }

    for (const [attr, attrConfig] of Object.entries(table.attrs)) {
        if (attrConfig.required && !tuple.has(attr)) {
            missingRequired.push(attr);
            continue;
        }

        /*fixme
        if (attrConfig.withValue && tuple.hasValue(attr)) {
            missingRequiredValue.push(attr);
            continue;
        }
        */
    }

    return { missingRequired, missingRequiredValue, extraAttrs }
}

