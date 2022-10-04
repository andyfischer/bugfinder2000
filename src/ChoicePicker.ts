
import { TestContext } from './TestContext'

export type Option = string | { name: string, [otherFields:string]: any }
export type OptionList = string | Option[]

export interface ChoicePicker {
    pickOne(label: string, options?: OptionList): any
}

export class RandomChoicePicker implements ChoicePicker {
    ctx: TestContext

    choicesMade: {
        label: string
        optionName: string
    }[] = []

    constructor(ctx: TestContext) {
        this.ctx = ctx;
    }

    pickOne(label: string, options?: OptionList) {

        if (!options)
            options = label;

        if (typeof options === 'string') {
            const choiceName: string = options;
            const foundData = this.ctx?.settings?.choiceDefinitions?.[choiceName];

            if (!foundData) {
                throw new Error("Named choice not found in definitions: " + choiceName)
            }
            options = foundData.options;
        }

        const chosenOption = options[randInt(options.length)];

        const optionName = (typeof chosenOption === 'string') ? chosenOption : chosenOption.name;

        this.choicesMade.push({
            label,
            optionName,
        });

        if (options.length === 1)
            this.ctx.log(`[using choice] ${label} = ${optionName}`);
        else
            this.ctx.log(`[random choice picked] ${label} = ${optionName}`);

        this.ctx.storage.save_picked_choice(label, optionName);

        return chosenOption;
    }
}

export function randInt(max: number) {
    let result = Math.floor(Math.random() * max);
    if (result >= max)
        result = max - 1;
    return result;
}
