
;(function(document, window, undefined) {

	//--------------------------------------------------
	// Config

		'use strict';

		var browser = (window.chrome || window.browser),
			info = {};

	//--------------------------------------------------
	// Resources

		info['resource_urls'] = [];

		var entries = window.performance.getEntriesByType('resource'),
			url;

		for (var k = (entries.length - 1); k >= 0; k--) {

			try {
				url = new URL(entries[k].name, document.baseURI);
			} catch (e) {
				url = null;
			}

			if (url) {
				info['resource_urls'].push(url.href);
			}

		}

	//--------------------------------------------------
	// Favicon

		var favicon = document.querySelector('link[rel="shortcut icon" i][href]');
		if (favicon) {
			try {
				favicon = new URL(favicon.getAttribute('href'), document.baseURI).href;
			} catch (e) {
				favicon = null;
			}
		}
		if (!favicon) {
			favicon = new URL('/favicon.ico', document.baseURI).href;
		}

		info['favicon_url'] = favicon;

	//--------------------------------------------------
	// Manifest URL

		var manifest = document.querySelector('link[rel="manifest" i][href]');
		if (manifest) {
			try {
				manifest = new URL(manifest.getAttribute('href'), document.baseURI).href;
			} catch (e) {
				manifest = null;
			}
		}

		info['manifest_url'] = manifest;

	//--------------------------------------------------
	// Feature policies

		info['feature_policies'] = (document.featurePolicy ? document.featurePolicy.features() : null);

	//--------------------------------------------------
	// Trusted types

		info['trusted_types'] = (window.trustedTypes ? window.trustedTypes.getPolicyNames() : null);

	//--------------------------------------------------
	// Sources

		info['link_noopener'] = [];

		var elements,
			value,
			target,
			rel,
			source,
			sources = [
				{
					'key': 'form_actions',
					'selector': 'form[action]',
					'attribute': 'action',
				},
				{
					'key': 'links',
					'selector': 'a[href]:not([href^="mailto:" i]):not([href^="tel:" i])', // Ignore mailto: and tel: links
					'attribute': 'href',
				},
			];

		for (var k = (sources.length - 1); k >= 0; k--) {

			source = sources[k];

			info[source['key']] = [];

			elements = document.querySelectorAll(source['selector']);

			for (var j = (elements.length - 1); j >= 0; j--) {

				try {
					value = new URL(elements[j].getAttribute(source['attribute']), document.baseURI);
				} catch (e) {
					value = null;
				}

				if (value) {
					info[source['key']].push(value.href);
				}

				if (source['key'] == 'links') {
					target = elements[j].getAttribute('target');
					rel = elements[j].getAttribute('rel');
					if (target && target.trim().toLowerCase() == '_blank' && (!rel || !rel.toLowerCase().split(' ').includes('noopener'))) {
						info['link_noopener'].push({
								'text': elements[j].textContent,
								'url': value.href,
							});
					}
				}

			}

		}

	//--------------------------------------------------
	// Return

		browser.runtime.sendMessage({'target': 'background', 'action': 'content', 'info': info});

})(document, window);
