
import { MountPoint } from './MountPoint'
import { QueryTuple, QueryTag, toQueryTuple, QueryStepLike } from './QueryTuple'
import { Graph } from './Graph'
import { tvalEquals } from './TaggedValue'
import { WarnOnMultipleMatches, VerboseTraceFindMatch, VerboseTraceFindMatchFails } from './config'
import { Trace } from './Trace'
import { ErrorItem } from './Errors'

// Exact match: the query specifies the exact same thing that
// the mount provides.
//
// This might be a universal attribute ("attribute") or it might
// be a specific value("attribute=x").

interface AttrExactMatch {
    t: 'exact'
}

// Partially filled / underprovided: The query asks for a universal
// match and the mount provides a specific subset.
//
// In this situation we might combine the results of multiple mounts,
// to deliver all the possible values that the query asks for.
interface AttrPartiallyFilled {
    t: 'attr_partially_filled'
}

// Overprovided: The query asks for a specific attribute value, and
// the provider gives a universal match.
//
// In this situation we'll probably use the mount, and then we'll
// add a "where" filter on the results.
interface AttrOverprovided {
    t: 'attr_overprovided'
}

interface UnusedOptional {
    t: 'unused_optional'
}

export type AttrMatch = AttrExactMatch | AttrPartiallyFilled | AttrOverprovided | UnusedOptional;

export interface QueryMountMatch {
    attrs: Map<string, AttrMatch>
    unusedOptionalsCount: number
}

export interface PointMatch {
    point: MountPoint
    match: QueryMountMatch
}

/*
 * findOneTagInPoint
 *
 * Search the MountPoint to find a match for this QueryTag.
 */
function findOneTagInPoint(trace: Trace, tag: QueryTag, point: MountPoint): AttrMatch {
    const attr = tag.attr;

    const queryHasKnownValue = tag.value.t !== 'no_value' && tag.value.t !== 'abstract';
    const queryWillHaveValue = queryHasKnownValue || (tag.value.t === 'abstract') || !!tag.identifier;
    const pointAttr = point.attrs[attr];

    if (!pointAttr) {

        // Mount does not provide this attribute.
        if (VerboseTraceFindMatchFails) {
            console.slog(`  match failed, rule does not have ${attr}:`, point.spec);
        }

        return null;
    }

    if (pointAttr.requiresValue && !queryWillHaveValue) {
        // Mount requires a value and the query doesn't provide.
        if (VerboseTraceFindMatchFails) {
            console.slog(`  match failed, rule requires value for ${attr}:`, point.spec);
        }
        return null;
    }

    if (pointAttr.specificValue) {
        if (queryHasKnownValue) {
            if (tvalEquals(pointAttr.specificValue, tag.value)) {
                return { t: 'exact' };
            } else {
                // Value not equal
                if (VerboseTraceFindMatchFails) {
                    console.slog(`  match failed, unequal known value for ${attr}:`, point.spec);
                }
                return null;
            }
        }

        if (queryWillHaveValue) {
            console.warn(`warning: can't yet support a match that is conditional on value (${attr})`);
            if (VerboseTraceFindMatchFails) {
                console.slog(`  match failed, dynamic value for ${attr}:`, point.spec);
            }
            return null;
        }

        return null;
    }

    if (queryWillHaveValue && !pointAttr.requiresValue) {
        // Query provides a value and the mount does accept one, this will overprovide data
        // and the results will need to be filtered.
        
        return { t: 'attr_overprovided' };
    } else {
        // Query provides a value and the mount accepts a value.
        return { t: 'exact' };
    }
}

export function getQueryMountMatch(trace: Trace, tuple: QueryTuple, point: MountPoint): QueryMountMatch {

    const attrMatches = new Map();
    let unusedOptionalsCount = 0;

    // Check each attribute on the tuple.
    for (const tag of tuple.tags) {

        if (tag.attr === undefined || tag.attr === 'undefined')
            throw new Error("attr = undefined?");
        
        if (!tag.attr)
            continue;
        
        let match = findOneTagInPoint(trace, tag, point);

        if (!match) {
            if (tag.isOptional) {
                match = { t: 'unused_optional' }
                unusedOptionalsCount++;
            } else {
                return null;
            }
        }

        attrMatches.set(tag.attr, match);
    }

    // Double check each attr on the mount to see if we missed anything required.
    for (const [ attr, config ] of Object.entries(point.attrs)) {
        if (config.required && !attrMatches.has(attr)) {
            // Mount requires this attribute.
            if (VerboseTraceFindMatchFails) {
                console.slog(`  match failed, rule requires ${attr}:`, point.spec);
            }
            return null;
        }
    }

    if (VerboseTraceFindMatch) {
        console.slog(`  match success for:`, point.spec, { attrMatches });
    }

    return {
        attrs: attrMatches,
        unusedOptionalsCount,
    }
}

export function getClosestWrongQueryMountMatch(trace: Trace, tuple: QueryTuple, point: MountPoint) {

    const attrMatches = new Map();
    const matchProblems = [];
    let unusedOptionalsCount = 0;

    // Check each attribute on the tuple.
    for (const tag of tuple.tags) {
        if (!tag.attr)
            continue;
        
        let match = findOneTagInPoint(trace, tag, point);

        if (!match) {
            if (tag.isOptional) {
                match = { t: 'unused_optional' }
                unusedOptionalsCount++;
                continue;
            }

            if (point.has(tag.attr) && point.requiresValue(tag.attr) && !tuple.hasValue(tag.attr)) {
                matchProblems.push({
                    attr: tag.attr,
                    t: 'missing_required_value',
                });
                continue;
            }

            matchProblems.push({
                attr: tag.attr,
                t: 'missing_from_point',
            });

            continue;
        }

        attrMatches.set(tag.attr, match);
    }

    // Double check each attr on the mount to see if we missed anything required.
    for (const [ attr, config ] of Object.entries(point.attrs)) {
        if (config.required && !tuple.has(attr)) {
            // Mount requires this attribute.
            matchProblems.push({
                t: 'missing_from_query',
                attr,
            });
        }
    }

    return {
        attrs: attrMatches,
        unusedOptionalsCount,
        matchProblems,
    }
}

export function findBestPointMatch(graph: Graph, trace: Trace, tupleLike: QueryStepLike): PointMatch | null {
    if (!graph)
        throw new Error("missing graph");

    const tuple = toQueryTuple(tupleLike);

    if (VerboseTraceFindMatchFails)
        console.slog('FindMatch searching for: ', tuple);

    let matches: PointMatch[] = [];

    const points = graph.everyMountPoint();
    for (const point of points) {
        const match = getQueryMountMatch(trace, tuple, point);

        if (match)
            matches.push({ point, match });
    }

    if (matches.length === 0)
        return null;

    // Prefer fewer missed optionals
    matches.sort((a,b) => a.match.unusedOptionalsCount - b.match.unusedOptionalsCount);

    // Maybe do something better here
    if (matches.length > 1 && matches[0].match.unusedOptionalsCount === matches[1].match.unusedOptionalsCount) {
        if (WarnOnMultipleMatches)
            console.warn("ambiguous match warning: multiple found for: " + tuple.toQueryString());
    }

    const match = matches[0];

    return match;
}

export function findClosestWrongMatches(graph: Graph, trace: Trace, tupleLike: QueryStepLike) {
    const tuple = toQueryTuple(tupleLike);

    let bestScore = null;
    let bestMatches = null;

    const points = graph.everyMountPoint();
    for (const point of points) {
        const match = getClosestWrongQueryMountMatch(trace, tuple, point);

        const score = match.attrs.size;

        if (bestScore === null || score > bestScore) {
            bestScore = score;
            bestMatches = [{point, match}];
        } else if (score == bestScore) {
            bestMatches.push({point, match});
        }
    }

    return {
        bestMatches
    }
}

export function errorForNoTableFound(graph: Graph, trace: Trace, tuple: QueryTuple): ErrorItem {

    const closestMatches = findClosestWrongMatches(graph, trace, tuple);

    let error: ErrorItem = {
        errorType: 'no_table_found',
        fromQuery: tuple.toQueryString(),
    }

    if (graph.tracingName) {
        error.data = error.data || [];
        error.data.push({
            searchedGraph: null,
            graph_name: graph.tracingName,
        });
    }

    if (closestMatches?.bestMatches?.length > 0) {
        error.data = error.data || [];

        let maxClosestPointsIncluded = 5;
        let count = 0;
        for (const { match, point } of closestMatches.bestMatches) {
            error.data.push({
                nearbyMatch: null,
                point_id: point.localId,
                point_decl: point.toDeclString(),
                match_problems: match.matchProblems,
            });


            count++;
            if (count > maxClosestPointsIncluded)
                break;
        }
    }

    return error;
}

