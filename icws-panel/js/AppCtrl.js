angular.module('IcwsPanel').controller('AppCtrl', ['$scope', '$window', function AppCtrl($scope, $window){
    var ctrl = this;

    this.requestEntries = {};
    this.communicationEntries = [];
    this.selectedEntryIndex = -1;
    this.selectedEntry = undefined;


    this.selectEntry = (entryIndex) => {
        if (entryIndex < 0 || entryIndex >= this.communicationEntries.length) {
            entryIndex = -1;
        }
        this.selectedEntryIndex = entryIndex;
        this.selectedEntry = entryIndex < 0 ? undefined : this.communicationEntries[entryIndex];
        highlightRelatedEntries(entryIndex);
    };

    function highlightRelatedEntries(entryIndex) {
        const referenceEntry = ctrl.communicationEntries[entryIndex];

        if (!referenceEntry) {
            ctrl.communicationEntries.forEach(entry => { entry.highlight = false; });
            return;
        }

        for (let entry of ctrl.communicationEntries) {
            entry.highlight = areRelatedEntries(entry, referenceEntry);
        }
    }

    function areRelatedEntries(entry1, entry2) {
        if (entry1 === entry2) {
            return true;
        }

        if (entry1.type === 'message' && entry2.type === 'message') {
            let messageType1 = entry1.content.__type,
                messageType2 = entry2.content.__type,
                subscriptionId1 = entry1.content.subscriptionId,
                subscriptionId2 = entry2.content.subscriptionId;

            if (messageType1 === messageType2 && subscriptionId1 === subscriptionId2) {
                return true;
            }
        }

        return false;
    }

    function getShortUrl(tmpl, params) {
        var url = tmpl, hasQS = (url.indexOf('?') !== -1), tokens = url.match(/\{([^\}]+)\}/g) || [];
            tokens.forEach(function(m){
                var tkn = m.slice(1, -1);
                if (tkn in params.template) {
                    url = url.replace(m, encodeURIComponent(params.template[tkn]));
                }
            });
            Object.keys(params.query).forEach(function(q){
                var value = params.query[q];
                if (Array.isArray(value)) { value = value.join(','); }
                url += (hasQS ? '&' : '?') + encodeURIComponent(q) + '=' + encodeURIComponent(value);
                hasQS = true;
            });
        return url;
    }

    function handleMessage(message) {
        ctrl.communicationEntries.push({
            type: 'message',
            timestamp: new Date(message.timestamp),
            resource: message.content.__type,
            content: message.content
        });
    }

    function handleRequest(message) {
        var request = message.content;
        var entry = ctrl.requestEntries[request.correlationId] = {
            type: 'request',
            timestamp: new Date(message.timestamp),
            resource: getShortUrl(request.urlTemplate, request.params),
            result: 'pending',
            content: request
        };
        request.shortUrl = entry.resource;
        request.requestTimestamp = entry.timestamp;
        ctrl.communicationEntries.push(entry);
    }

    function handleResponse(message) {
        var entry = ctrl.requestEntries[message.content.correlationId];
        if (entry) {
            var request = entry.content,
                response = message.content;

            request.status = response.status;
            request.result = entry.result = response.result;
            request.responseTimestamp = new Date(message.timestamp);
            request.responseContent = response.content;
            request.duration = request.responseTimestamp.getTime() - request.requestTimestamp.getTime();
        }
    }

    // Create a connection to the background page
    var backgroundPageConnection = chrome.runtime.connect({
        name: 'icws-panel'
    });

    backgroundPageConnection.postMessage({
        type: 'panel-init',
        tabId: chrome.devtools.inspectedWindow.tabId
    });

    backgroundPageConnection.onMessage.addListener(message => {
        if (typeof message.content === 'string') {
            message.content = JSON.parse(message.content);
        }
        if (message.type === 'status') {
            console.log(`Status message from background page: ${message.data}`);
        } else if (message.type === 'icws-message') {
            $scope.$apply(() => handleMessage(message));
        } else if (message.type === 'icws-request') {
            $scope.$apply(() => handleRequest(message));
        } else if (message.type === 'icws-response') {
            $scope.$apply(() => handleResponse(message));
        }
    });
}]);
