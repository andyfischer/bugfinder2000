
import { OnConflictOption } from '../Schema'
import TableIndex from './TableIndex'

export interface UniquenessConstraint<ItemType> {
    constraintType: 'unique'
    onConflict: OnConflictOption
    index: TableIndex<ItemType>
}

export interface RequiredAttrConstraint {
    constraintType: 'required_attr'
    attr: string
}

export type Constraint<ItemType> = UniquenessConstraint<ItemType> | RequiredAttrConstraint
