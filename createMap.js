// Automatically creates the lookup relation data structure
"use strict";
// source is parent, mapping is child
var map = {};
// var apps = [];
var fieldCode = "mapAsJSON"

// Since API GET can only get up to 100 apps per call, we
// need to account for cases where there are more than 100 apps
function fetchApps(opt_offset, opt_limit, opt_apps) {
    var offset = opt_offset || 0;
    var limit = opt_limit || 100;
    var allApps = opt_apps || [];
    var params = {limit: limit, offset: offset};
    return kintone.api('/k/v1/apps', 'GET', params).then(function(resp) {
        allApps = allApps.concat(resp.apps);
        if (resp.apps.length === limit) {
            return fetchApps(offset + limit, limit, allApps);
        }
        return allApps;
    });
}

function fetchLookups(apps, appIndex, opt_map) {
    var entireMap = opt_map || {};
    var appId = apps[appIndex]["appId"];
    var params = {app: appId};
    return kintone.api('/k/v1/app/form/fields', 'GET', params).then(function(resp) {
        var fields = resp.properties;
        for (var key in fields) {
            var field = fields[key];
            var lookup = field.lookup;
            if (lookup) {
                var sourceAppId = lookup.relatedApp.app;
                var fieldMappings = lookup.fieldMappings;
                if (!entireMap[sourceAppId]) {
                    entireMap[sourceAppId] = {};
                }
                var lookupFieldData = {
                    "fieldCode": key,
                    "relatedLookupField": lookup.relatedKeyField,
                    "fieldMappings": lookup.fieldMappings
                };
                entireMap[sourceAppId][appId] = lookupFieldData;
            }
        }
        if (appIndex + 1 < apps.length) {
            return fetchLookups(apps, appIndex + 1, entireMap);
        }
        return entireMap;
    });
}

function generateMap() {
    return new Promise(function(resolve, reject) {
        resolve(fetchApps());
    }).then( function(allApps) {
        return fetchLookups(allApps, 0);
    }).then( function(entireMap) {
        map = entireMap;
        return entireMap;
    });
}

function findMap() {
    return kintone.api('/k/v1/apps', 'GET', {name: "Map Source"}).then(function(resp) {
        return resp.apps[0].appId;
    }).then( function(mapAppId) {
        var body = {
             "app": mapAppId,
             "query": "order by Updated_datetime desc limit 1"
        };
        return kintone.api('/k/v1/records', 'GET', body).then( function(resp) {
            if (resp.records.length !== 0) {
                map = JSON.parse(resp.records[0][fieldCode].value);
                console.log(map);
                console.log("found");
                return map;
            } else {
                return generateMap().then( function(entireMap) {
                    var body = {
                        "app": mapAppId,
                        "record": {}
                    };
                    body.record[fieldCode] = {};
                    body.record[fieldCode].value = JSON.stringify(entireMap);
                    return kintone.api('/k/v1/record', 'POST', body).then( function(resp) {
                        // success: record creation succeeded.
                        console.log(map);
                        return map;
                    }, function(error) {
                        // error: record creation failed.
                        throw Error("failed to create new record.")
                    });
                });
            }
        });
    }).then(function(map) {
        return map;
    });
}
