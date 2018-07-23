/*
* Code based on example provided at: https://kintoneapp.com/blog/lookup_improvement/
*/
jQuery.noConflict();
(function($, PLUGIN_ID) {
    "use strict";

    //TODO: fix this so that str can have ", "", ', '', and other patterns of escape characters
    function escapeStr(str) {
        var escaped = str;
        // var escaped = (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');
        // var escaped = str.replace(/\\([\s\S])|(")/g, "\\$1$2");
        // var escaped = str.replace(/\x22/g, '\\\x22').replace(/\x27/g, '\\\x27');
        var escaped = str.replace(/\x22/g, '\\\x22');

        // console.log('"' + escaped + '"');
        return '"' + escaped + '"';
    }

    // checks if map is defined. Is a promise.
    function checkMap() {
        return new Promise( function(resolve, reject) {
            if (Object.keys(map).length === 0) {
                resolve(findMap());
            } else {
                resolve(map);
            }
        });
    }

    // var recordBeforeChange;
    function updateChildren(sourceAppId, recordBeforeChange, recordAfterChange, recordId) {
        if (!map[sourceAppId]) {
            return sourceAppId + " no children, end of chain";
        } else if (JSON.stringify(recordBeforeChange) === JSON.stringify(recordAfterChange)) {
            return "no change made to record";
        } else {
            var destAppIds = Object.keys(map[sourceAppId]);
            var l = destAppIds.length;
            var chain = Promise.resolve();
            for (let i = 0; i < l; i++) {
                chain = chain.then(function() {
                    return updateRecords(sourceAppId, destAppIds, recordBeforeChange, recordAfterChange, recordId, i);
                });
            }
            return chain;
        }
    }

    kintone.events.on(['app.record.edit.submit', 'app.record.index.edit.submit'], function(event) {
        var sourceAppId = kintone.app.getId();
        var recordAfterChange = event.record;
        console.log("after");
        console.log(recordAfterChange);
        var recordId = event.recordId;
        kintone.api('/k/v1/record', 'GET', {app: sourceAppId, id: recordId}).then(function(resp) {
            var recordBeforeChange = resp.record;
            console.log("before");
            console.log(recordBeforeChange);
            return recordBeforeChange;
        }).then( function(recordBeforeChange) {
            checkMap().then( function(map) {
                console.log(map);
                return updateChildren(sourceAppId, recordBeforeChange, recordAfterChange, recordId);
            }).then( function(message) {
                console.log(message);
            });
        });
    });

    function fetchRecords(appId, query, opt_offset, opt_limit, opt_records) {
        var offset = opt_offset || 0;
        var limit = opt_limit || 100;
        var allRecords = opt_records || [];
        var params = {app: appId, query: query + ' limit ' + limit + ' offset ' + offset};
        return kintone.api('/k/v1/records', 'GET', params).then(function(resp) {
            allRecords = allRecords.concat(resp.records);
            if (resp.records.length === limit) {
                return fetchRecords(appId, query, offset + limit, limit, allRecords);
            }
            return allRecords;
        });
    }

    function updateRecords(sourceAppId, destAppIds, recordBeforeChange, recordAfterChange, recordId, appIndex) {
        var destAppId = destAppIds[appIndex];
        var lookupFieldData = map[sourceAppId][destAppId];
        var query = lookupFieldData.fieldCode + ' = ' + escapeStr(recordBeforeChange[lookupFieldData.relatedLookupField].value);
        console.log(query);
        return fetchRecords(destAppId, query).then( function(records) {
            var recCount = records.length;
            var putCount = Math.ceil(recCount / 100);
            for (var i = 0; i < putCount; i++) {
                var offset = i * 100;
                var initialOffset = offset; //because offset changes in the for loop below
                var limit = 100;
                if (offset + limit > recCount) {
                    limit = recCount - offset;
                }
                var putLimit = limit + offset;

                var editRecords = [];
                // overwrite the new data to matching records
                // TODO: abort if no change
                for (offset; offset < putLimit; offset++) {
                    var record = $.extend(true, {}, records[offset]);
                    var recId = record['$id'].value;
                    delete record['$id'];
                    delete record['$revision'];
                    delete record['Record_number'];
                    delete record['Created_datetime'];
                    delete record['Created_by'];
                    delete record['Updated_datetime'];
                    delete record['Updated_by'];
                    "sdfsd''//v fsdf"
                    record[lookupFieldData.fieldCode] = recordAfterChange[lookupFieldData.relatedLookupField];
                    lookupFieldData.fieldMappings.forEach( function(mapping) {
                        record[mapping.field] = recordAfterChange[mapping.relatedField];
                    });
                    editRecords.push({'id': recId, 'record': record});
                }

                var l = editRecords.length;
                var chain = Promise.resolve();
                chain = chain.then( function() {
                    return kintone.api('/k/v1/records', 'PUT', {app: destAppId, 'records': editRecords}).then(function(resp) {
                        console.log("DestAppId is: " + destAppId);
                        return "updated records";
                    }, function(error) {
                        throw error;
                    });
                });
                for (let i = 0; i < l; i++) {
                    chain = chain.then( function() {
                        return updateChildren(destAppId, records[initialOffset + i], editRecords[i].record, editRecords[i].id);
                    });
                }
                return chain;
            }
        });
    }
})(jQuery, kintone.$PLUGIN_ID);
