var styleTemplate = document.createElement("div");
styleTemplate.innerHTML = "<input class='checker' type='checkbox'><div class='style-name'></div><div class='actions'><a href='#' class='enable'>" + t('enableStyleLabel') + "</a> <a href='#' class='disable'>" + t('disableStyleLabel') + "</a> <a class='style-edit-link' href='edit.html?id='>" + t('editStyleLabel') + "</a> <a href='#' class='delete'>" + t('deleteStyleLabel') + "</a></div>";

var writeStyleTemplate = document.createElement("a");
writeStyleTemplate.className = "write-style-link";

if (!prefs.getPref("popup.stylesFirst")) {
	document.body.insertBefore(document.querySelector("body > .actions"), document.getElementById("installed"));
}

chrome.tabs.getSelected(null, function(tab) {
	var urlWillWork = /^(file|http|https|chrome\-extension):/.exec(tab.url);

	if (!urlWillWork) {
		document.body.classList.add("blocked");
		tE("unavailable", "stylishUnavailableForURL");
		return;
	}

	chrome.extension.sendMessage({method: "getStyles", matchUrl: tab.url}, showStyles);
	document.querySelector("#find-styles a").href = "https://userstyles.org/styles/browse/all/" + encodeURIComponent("file" === urlWillWork[1] ? "file:" : tab.url);

	// Write new style links
	var writeStyleLinks = [],
	    container = document.createElement('span');
	container.id = "match";

	// For this URL
	var urlLink = writeStyleTemplate.cloneNode(true);
	urlLink.href = "edit.html?url-prefix=" + encodeURIComponent(tab.url);
	urlLink.appendChild(document.createTextNode( // switchable; default="this&nbsp;URL"
		!prefs.getPref("popup.breadcrumbs.usePath")
		? t("writeStyleForURL").replace(/ /g, "\u00a0")
		: /\/\/[^/]+\/(.*)/.exec(tab.url)[1]
	));
	urlLink.title = "url-prefix(\"$\")".replace("$", tab.url);
	writeStyleLinks.push(urlLink);
	document.querySelector("#write-style").appendChild(urlLink)
	if (prefs.getPref("popup.breadcrumbs")) { // switchable; default=enabled
		urlLink.addEventListener("mouseenter", function(event) { this.parentNode.classList.add("url()") }, false);
		urlLink.addEventListener("focus", function(event) { this.parentNode.classList.add("url()") }, false);
		urlLink.addEventListener("mouseleave", function(event) { this.parentNode.classList.remove("url()") }, false);
		urlLink.addEventListener("blur", function(event) { this.parentNode.classList.remove("url()") }, false);
	}

	// For domain
	var domains = getDomains(tab.url)
	domains.forEach(function(domain) {
		// Don't include TLD
		if (domains.length > 1 && domain.indexOf(".") == -1) {
			return;
		}
		var domainLink = writeStyleTemplate.cloneNode(true);
		domainLink.href = "edit.html?domain=" + encodeURIComponent(domain);
		domainLink.appendChild(document.createTextNode(domain));
		domainLink.title = "domain(\"$\")".replace("$", domain);
		domainLink.setAttribute("subdomain", domain.substring(0, domain.indexOf(".")));
		writeStyleLinks.push(domainLink);
	});

	var writeStyle = document.querySelector("#write-style");
	writeStyleLinks.forEach(function(link, index) {
		link.addEventListener("click", openLinkInTabOrWindow, false);
		container.appendChild(link);
	});
	if (prefs.getPref("popup.breadcrumbs")) {
		container.classList.add("breadcrumbs");
		container.appendChild(container.removeChild(container.firstChild));
	}
	writeStyle.appendChild(container);
});

function showStyles(styles) {
	var enabledFirst = prefs.getPref("popup.enabledFirst");
	styles.sort(function(a, b) {
		if (enabledFirst && a.enabled !== b.enabled) return !(a.enabled < b.enabled) ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
	var installed = document.getElementById("installed");
	if (styles.length == 0) {
		installed.innerHTML = "<div class='entry' id='no-styles'>" + t('noStylesForSite') + "</div>";
	}
	styles.map(createStyleElement).forEach(function(e) {
		installed.appendChild(e);
	});
}

function createStyleElement(style) {
	var e = styleTemplate.cloneNode(true);
	var checkbox = e.querySelector(".checker");
	checkbox.checked = style.enabled == "true";

	e.setAttribute("class", "entry " + (style.enabled == "true" ? "enabled" : "disabled"));
	e.setAttribute("style-id", style.id);
	var styleName = e.querySelector(".style-name");
	styleName.appendChild(document.createTextNode(style.name));
	var editLink = e.querySelector(".style-edit-link");
	editLink.setAttribute("href", editLink.getAttribute("href") + style.id);
	editLink.addEventListener("click", openLinkInTabOrWindow, false);

	// the checkbox will not toggle itself after clicking the name, but calling enable will regenerate it
	styleName.addEventListener("click", function() { enable(event, !event.target.previousSibling.checked); }, false);
	// clicking the checkbox will toggle it, and this will run after that happens
	checkbox.addEventListener("click", function() { enable(event, event.target.checked); }, false);
	e.querySelector(".enable").addEventListener("click", function() { enable(event, true); }, false);
	e.querySelector(".disable").addEventListener("click", function() { enable(event, false); }, false);

	e.querySelector(".delete").addEventListener("click", function() { doDelete(event, false); }, false);
	return e;
}

function enable(event, enabled) {
	var id = getId(event);
	enableStyle(id, enabled);
}

function doDelete() {
	// Opera can't do confirms in popups
	if (getBrowser() != "Opera") {
		if (!confirm(t('deleteStyleConfirm'))) {
			return;
		}
	}
	var id = getId(event);
	deleteStyle(id);
}

function getBrowser() {
	if (navigator.userAgent.indexOf("OPR") > -1) {
		return "Opera";
	}
	return "Chrome";
}

function getId(event) {
	var e = event.target;
	while (e) {
		if (e.hasAttribute("style-id")) {
			return e.getAttribute("style-id");
		}
		e = e.parentNode;
	}
	return null;
}

function openLinkInTabOrWindow(event) {
	event.preventDefault();
	if (prefs.getPref('openEditInWindow', false)) {
		var options = {url: event.target.href}
		var wp = prefs.getPref('windowPosition', {});
		for (var k in wp) options[k] = wp[k];
		chrome.windows.create(options);
	} else {
		openLink(event);
	}
}

function openLink(event) {
	event.preventDefault();
	chrome.tabs.query({currentWindow: true, active: true}, function (tabs) {
		if (tabs && tabs.length && tabs[0].url.match(/^chrome:\/\/newtab\/?$/)) {
			chrome.tabs.update({url: event.target.href});
			close(); // close the popup
		} else {
			chrome.tabs.create({url: event.target.href});
		}
	});
}

function handleUpdate(style) {
	var installed = document.getElementById("installed");
	installed.replaceChild(createStyleElement(style), installed.querySelector("[style-id='" + style.id + "']"));
}

function handleDelete(id) {
	var installed = document.getElementById("installed");
	installed.removeChild(installed.querySelector("[style-id='" + id + "']"));
}

tE("open-manage-link", "openManage");
tE("write-style-for", "writeStyleFor");
tE("find-styles-link", "findStylesForSite");
tE("disableAll-label", "disableAllStyles");

["find-styles-link", "open-manage-link"].forEach(function(id) {
	document.getElementById(id).addEventListener("click", openLink, false);
});

loadPrefs({"disableAll": false})
document.getElementById("disableAll").addEventListener("change", function(event) {
	notifyAllTabs({method: "styleDisableAll", disableAll: event.target.checked});
});
