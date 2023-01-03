
var dev_headers = {};

;(function(undefined) {

	//--------------------------------------------------
	// Config

		'use strict';

		var browser = (chrome || browser),
			dev_config = {},
			popup_tab_id = null,
			popup_origin = null,
			tab_responses = {},
			tab_incognito = {},
			tab_enabled_new = {},
			tab_enabled_old = {},
			icon_text_timeout = null,
			header_details = [
					{'abbr': 'CSP',  'name': 'Content-Security-Policy',      'recommended': 'all'},
					{'abbr': 'PP',   'name': 'Permissions-Policy',           'recommended': 'main'},
					{'abbr': 'RP',   'name': 'Referrer-Policy',              'recommended': 'all'},
					{'abbr': 'CORP', 'name': 'Cross-Origin-Resource-Policy', 'recommended': 'all'},
					{'abbr': 'COOP', 'name': 'Cross-Origin-Opener-Policy',   'recommended': 'all'},
					{'abbr': 'FO',   'name': 'X-Frame-Options',              'recommended': 'all'},
					{'abbr': 'CTO',  'name': 'X-Content-Type-Options',       'recommended': 'all'},
					{'abbr': 'STS',  'name': 'Strict-Transport-Security',    'recommended': 'all'},
				];

		for (var k = (header_details.length - 1); k >= 0; k--) {
			header_details[k]['name_lower'] = header_details[k]['name'].toLowerCase();
		}

	//--------------------------------------------------
	// Very rough URL parsing and matching

		dev_headers.url_parse = function(str) {

				// Value from CSP must not contain username, password, query-string or hash, as per the spec.
				// Value from Resource URL's must have these values removed.

			if (str == '*' || str.substr(0, 1) == '\'') {
				return null;
			}

			var match,
				matched = false,
				parts = {
						'scheme': null,
						'host': null,
						'port': null,
						'path': null,
					};

			match = str.match(/^(https?|wss?):(\/\/)?(.*)$/i); // Do not match any scheme
			if (match) {
				parts['scheme'] = match[1].toLowerCase();
				str = match[3];
				matched = true;
			}

			match = str.match(/^([^\/:]+)(:([0-9]+))?(\/(.*))?$/); // Hostname, and optional port
			if (match) {
				parts['host'] = match[1].toLowerCase();
				if (match[3]) {
					parts['port'] = parseInt(match[3], 10);
				} else if (parts['scheme'] === 'http' || parts['scheme'] === 'ws') { // Guess the port based on scheme (CSP or Resource might specify, so try to provide to both)
					parts['port'] = 80;
				} else if (parts['scheme'] === 'https'|| parts['scheme'] === 'wss') {
					parts['port'] = 443;
				}
				str = (match[4] ? match[4] : ''); // Not left 'undefined'
				matched = true;
			}

			match = str.match(/^([^\?#]+)/); // Path, removing query string
			if (match) {
				parts['path'] = match[1]; // Case sensitive
				matched = true;
			}

			return (matched ? parts : null);

		}

		dev_headers.url_match = function(csp_url, resource_url) {

			var matches = [];

			for (var part in csp_url) {
				if (csp_url[part] !== null) {
					if (part === 'scheme' || part === 'port') {
						if (csp_url[part] === resource_url[part]) {
							matches.push(part);
						} else {
							return false;
						}
					} else if (part === 'host') {
						if (csp_url[part].indexOf('*.') == 0) { // When the csp_url 'host' begins '*.example.com' ... https://www.w3.org/TR/CSP3/#match-hosts
							if (resource_url[part].slice(0 - (csp_url[part].length - 1)) === csp_url[part].substr(1)) { // Ignore the leading '.'
								matches.push(part);
							} else {
								return false;
							}
						} else if (csp_url[part] === resource_url[part]) { // Exact match, e.g. 'example.com' = 'example.com', not 'example.com' != 'www.example.com'
							matches.push(part);
						} else {
							return false;
						}
					} else if (part === 'path') {
						if (csp_url[part] === '/') {
							matches.push(part);
						} else if (csp_url[part].slice(-1) === '/') { // Folder path match
							if (resource_url[part].substring(0, csp_url[part].length) === csp_url[part]) {
								matches.push(part);
							} else {
								return false;
							}
						} else if (csp_url[part] === resource_url[part]) {
							matches.push(part);
						} else {
							return false;
						}
					} else {
						return false;
					}
				}
			}

			if (matches.length > 0) {
				return matches;
			} else {
				return false;
			}

		}

			// var parsing_tests = {
			// 		'https://example.com:443/path/file.html?query=value#hash': ['scheme', 'host', 'port', 'path'],
			// 		'https://example.com:443/path/file.html':                  ['scheme', 'host', 'port', 'path'],
			// 		'https://example.com':                                     ['scheme', 'host', 'port',       ], // Port is guessed
			// 		'https://':                                                ['scheme',                       ],
			// 		'example.com':                                             [          'host',               ],
			// 		'example.com:443':                                         [          'host', 'port',       ],
			// 		'example.com/path/file.html':                              [          'host',         'path'],
			// 		'example.com/path/file.html#hash':                         [          'host',         'path'],
			// 		'*':                                                       null,
			// 		'\'self\'':                                                null,
			// 	};
			//
			// for (var url in parsing_tests) {
			// 	var result = dev_headers.url_parse(url);
			// 	console.log(result);
			// 	if (parsing_tests[url] === null) {
			// 		if (result !== null) {
			// 			console.log('### Should not parse'); return;
			// 		}
			// 	} else {
			// 		if (result === null) {
			// 			console.log('### Should parse'); return;
			// 		} else {
			// 			for (var part in result) {
			// 				if (result[part] === null) {
			// 					if (parsing_tests[url].includes(part)) {
			// 						console.log('### Should include: ' + part); return;
			// 					}
			// 				} else {
			// 					if (!parsing_tests[url].includes(part)) {
			// 						console.log('### Should not include: ' + part); return;
			// 					}
			// 				}
			// 			}
			// 		}
			// 	}
			// }
			//
			// console.log('---');
			//
			// var matching_tests = {
			// 		'www.example.com/path/to/file.txt': {
			// 				'https://www.example.com/path/to/file.txt':     ['host', 'path'],
			// 				'HTTPS://www.EXAMPLE.com/path/to/file.txt':     ['host', 'path'], // Case insensitive scheme and host
			// 				'https://www.EXAMPLE.com/path/to/FILE.txt':     false, // Case sensitive path
			// 				'https://www.example.com/path/to/other.txt':    false, // Wrong path
			// 			},
			// 		'www.example.com/path/': {
			// 				'https://www.example.com/path/to/file.txt':     ['host', 'path'],
			// 				'https://www.example.com/path/':                ['host', 'path'],
			// 				'https://www.example.com/path-other/':          false,
			// 			},
			// 		'www.example.com/path': {
			// 				'https://www.example.com/path/to/file.txt':     false, // Folder matches must end with a '/'
			// 				'https://www.example.com/path/':                false,
			// 				'https://www.example.com/path':                 ['host', 'path'], // Exact path match
			// 				'https://www.example.com/path-other/':          false,
			// 			},
			// 		'www.example.com': {
			// 				'https://www.example.com/path/to/file.txt':     ['host'],
			// 				'https://www.example.org/path/to/file.txt':     false, // For a '.org'
			// 				'https://example.com/path/to/file.txt':         false,
			// 				'https://www.example.com:443/path/to/file.txt': ['host'],
			// 				'https://www.example.com:444/path/to/file.txt': ['host'], // The port isn't really known, not sure about this one.
			// 			},
			// 		'https://www.example.com': {
			// 				'https://www.example.com:443/path/to/file.txt': ['scheme', 'host', 'port'], // The port is guessed by the scheme
			// 				'https://www.example.com:444/path/to/file.txt': false
			// 			},
			// 		'www.example.com:443': {
			// 				'https://www.example.com/path/to/file.txt':     ['host', 'port'], // The port is guessed by the scheme
			// 				'https://www.example.com:443/path/to/file.txt': ['host', 'port'],
			// 				'https://www.example.com:444/path/to/file.txt': false,
			// 			},
			// 		'*.example.com': {
			// 				'https://www.example.com/path/to/file.txt':     ['host'],
			// 				'https://example.com/path/to/file.txt':         false, // Using '*' requires a sub-domain to match
			// 			},
			// 		'example.com': {
			// 				'https://www.example.com/path/to/file.txt':     false, // Host checking is for an exact match
			// 				'https://example.com/path/to/file.txt':         ['host'],
			// 			},
			// 		'https:': {
			// 				'https://www.example.com/path/to/file.txt':     ['scheme'],
			// 				'http://www.example.com/path/to/file.txt':      false,
			// 			},
			// 	};
			//
			// for (var csp_url in matching_tests) {
			// 	var csp_parsed = dev_headers.url_parse(csp_url);
			// 	for (var resource_url in matching_tests[csp_url]) {
			// 		console.log('"' + csp_url + '" vs "' + resource_url + '"');
			// 		var match_should = matching_tests[csp_url][resource_url];
			// 		var match_found = dev_headers.url_match(csp_parsed, dev_headers.url_parse(resource_url));
			// 		if (match_found === false) {
			// 			if (match_should !== false) {
			// 				console.log('### Should match'); return;
			// 			}
			// 		} else if (match_should === false) {
			// 			console.log('### Should not match'); return;
			// 		} else {
			// 			var match_missing_a = match_found.filter(function(i) { return match_should.indexOf(i) < 0 });
			// 			var match_missing_b = match_should.filter(function(i) { return match_found.indexOf(i) < 0 });
			// 			if (match_missing_a.length > 0) { console.log('### Should include: ' + match_missing_a.join(', ')); return; };
			// 			if (match_missing_b.length > 0) { console.log('### Should not include: ' + match_missing_b.join(', ')); return; };
			// 		}
			// 	}
			// }

	//--------------------------------------------------
	// Policy Parsing

		dev_headers.policy_parse = function(policy_content, current_origin) {

			var policy_directives,
				policy_parsed = {},
				directive_start,
				directive_name,
				directive_value,
				directive_options,
				value_clean,
				value_short,
				value_parsed,
				value_keyword,
				value_nonce,
				value_hash;

			if (policy_content) {
				policy_directives = policy_content.split(';');
			} else {
				policy_directives = [];
			}

			for (var k = 0, l1 = (policy_directives.length); k < l1; k++) {

				directive_value = policy_directives[k].trim();
				directive_start = directive_value.indexOf(' ');

				if (directive_start >= 0) {
					directive_name = directive_value.substring(0, directive_start);
					directive_options = directive_value.substring(directive_start).trim().split(' ');
				} else {
					directive_name = directive_value;
					directive_options = [];
				}

				directive_name = directive_name.trim().toLowerCase();

				if (directive_name) {

					policy_parsed[directive_name] = [];

					for (var j = 0, l2 = (directive_options.length); j < l2; j++) {

						value_clean = directive_options[j].trim();

						value_short = value_clean;
						if (current_origin && value_short.substring(0, current_origin.length) == current_origin) {
							value_short = value_short.substring(current_origin.length);
						}

						value_parsed = value_clean.match(/'((nonce-|sha256-|sha384-|sha512-)?(.*))'/);
						value_keyword = null;
						value_nonce = null;
						value_hash = null;
						if (value_parsed) {
							value_keyword = value_parsed[1];
							if (value_parsed[2] == 'nonce') {
								value_nonce = value_parsed[3];
							} else if (value_parsed[2]) {
								value_hash = value_parsed[3];
							}
						}

						policy_parsed[directive_name].push({
								'value': value_clean,
								'value_short': value_short,
								'value_url': dev_headers.url_parse(value_clean),
								'value_keyword': value_keyword,
								'value_nonce': value_nonce,
								'value_hash': value_hash,
								'matches': [],
								'notes': [],
							});

					}

				}

			}

			return policy_parsed;

		}

	//--------------------------------------------------
	// CSP Parsing

		dev_headers.csp_parse = function(csp_content, current_origin, current_content, current_responses, current_extra_responses) {

			//--------------------------------------------------
			// Initial

				var csp_parsed = dev_headers.policy_parse(csp_content, current_origin),
					csp_warning_count = 0,
					csp_warning_overview = [];

			//--------------------------------------------------
			// Overview warnings

				if (!csp_parsed['default-src']) {

					csp_warning_overview.push('No \'default-src\' specified.');

				} else if (csp_parsed['default-src'].length != 1 || csp_parsed['default-src'][0]['value'] != '\'none\'') {

					csp_warning_overview.push('The \'default-src\' should be set to \'none\'.');

				}

				if (!csp_parsed['base-uri']) {
					csp_warning_overview.push('No \'base-uri\' specified.');
				}

				if (!csp_parsed['frame-ancestors']) {
					csp_warning_overview.push('No \'frame-ancestors\' specified.');
				}

				if (!csp_parsed['block-all-mixed-content']) {
					csp_warning_overview.push('No \'block-all-mixed-content\' specified.');
				}

				// if (!csp_parsed['require-trusted-types-for']) {
				// 	csp_warning_overview.push('No \'require-trusted-types-for\' specified.'); // TODO: Enable 'require-trusted-types-for'
				// }

			//--------------------------------------------------
			// Extra overview warnings

				if (current_content) { // ... for the main request



				} else { // ... for the sub responses

					if (!csp_parsed['form-action']) {
						csp_warning_overview.push('Sub-responses should specify \'form-action\'.');
					}

				}

			//--------------------------------------------------
			// Manifest URL

				var manifest_url = null;

				if (current_content) {
					try {
						manifest_url = new URL(current_content['manifest_url']);
					} catch (e) {
						manifest_url = null;
					}
				}

			//--------------------------------------------------
			// Favicon URL

				// current_content['favicon_url'] ... Do we need this? The manifest_url is just being used to identify the CSP directive.

			//--------------------------------------------------
			// Match URLs

				var match_urls = [];

				if (current_responses) {
					for (var id in current_responses) {

						match_urls.push({
								'url': current_responses[id]['url'],
								'type': current_responses[id]['type'],
							});

					}
				}

				if (current_content) {

					var source,
						sources = [
							{
								'key': 'form_actions',
								'type': 'form',
							},
							{
								'key': 'links',
								'type': 'link',
							},
						];

					for (var k = (sources.length - 1); k >= 0; k--) {
						source = sources[k];
						if (current_content[source['key']]) {
							for (var j = (current_content[source['key']].length - 1); j >= 0; j--) {

								match_urls.push({
										'url': current_content[source['key']][j],
										'type': source['type'],
									});

							}
						}
					}

				}

				if (current_extra_responses) {
					match_urls = match_urls.concat(current_extra_responses);
				}

			//--------------------------------------------------
			// Match responses against policy

				var response,
					response_url,
					response_url_anon,
					directive,
					match_url,
					match_score,
					match_best_id,
					match_best_length,
					match_self_id,
					missing_sources = [];

				for (var k = (match_urls.length - 1); k >= 0; k--) {

					response = match_urls[k];

					try {
						response_url = new URL(response['url']);
						response_url.hash = ''; // Remove anchors, probably from current_content (the server does not see these)
					} catch (e) {
						console.log(['Not URL', response]);
						continue;
					}

					directive = null;
					if (response['type'] == 'main_frame') continue;
					if (response['type'] == 'sub_frame') directive = 'frame-src';
					if (response['type'] == 'stylesheet') directive = 'style-src';
					if (response['type'] == 'script') directive = 'script-src';
					if (response['type'] == 'image') directive = 'img-src';
					if (response['type'] == 'media') directive = 'media-src';
					if (response['type'] == 'font') directive = 'font-src';
					if (response['type'] == 'object') directive = 'object-src';
					if (response['type'] == 'ping') directive = 'connect-src';
					if (response['type'] == 'xmlhttprequest') directive = 'connect-src';
					if (response['type'] == 'form') directive = 'form-action';
					if (response['type'] == 'link') directive = 'navigate-to';

					if (directive === null && manifest_url && manifest_url.href == response_url.href) {
						directive = 'manifest-src';
					}

					if (directive === null || !csp_parsed[directive]) {
						if (directive !== null && directive.substr(-4) == '-src') { // Do not use 'default-src' for directives such as 'navigate-to'
							directive = 'default-src';
						}
						if (!csp_parsed[directive]) {
							continue;
						}
					}

					match_best_id = null;
					match_best_length = null;
					match_self_id = null; // The entry id if 'self' exists.

					for (var j = (csp_parsed[directive].length - 1); j >= 0; j--) {

						if (csp_parsed[directive][j]['value_keyword'] == 'self') {
							match_self_id = j;
							continue;
						}

						if (csp_parsed[directive][j]['value'] == '*') {

							if (match_best_length === null) {
								match_best_id = j;
								match_best_length = 0; // It matches, but anything else would be better (to hopefully show it's not needed).
							}

						} else if (csp_parsed[directive][j]['value_url']) {

							response_url_anon = response_url;
							response_url_anon.username = '';
							response_url_anon.password = '';
							response_url_anon.search = '';
							response_url_anon.hash = '';

							match_url = dev_headers.url_match(csp_parsed[directive][j]['value_url'], dev_headers.url_parse(response_url_anon.href));

							if (match_url !== false) {
								match_score = 0;
								for (var i = (match_url.length - 1); i >= 0; i--) {
									match_score += csp_parsed[directive][j]['value_url'][match_url[i]].length;
								}
								if (match_best_length === null || match_score > match_best_length) {
									match_best_id = j;
									match_best_length = match_score;
								}
							}

						}

					}

					if ((match_best_id === null || match_best_length === 0) && (response_url.origin == current_origin)) { // Did not find anything, or its length matched 0 for '*'
						match_best_id = match_self_id;
					}

					if (match_best_id !== null) {
						csp_parsed[directive][match_best_id]['matches'].push(response);
					} else {
						missing_sources.push('Missing ' + directive + ': ' + response_url.href);
					}

				}

				if (missing_sources.length > 0) {

					missing_sources = missing_sources.filter(function(item, pos) { // Remove duplicates
							return (missing_sources.indexOf(item) == pos);
						});

					csp_warning_overview = csp_warning_overview.concat(missing_sources);

				}

			//--------------------------------------------------
			// Notes

				var option,
					notes,
					used,
					ignored,
					ignore_unsafe_inline,
					allow_data = ['img-src', 'font-src'],
					allow_self = ['default-src', 'form-action', 'navigate-to']; // Where 'default-src' has it's own check for being set to 'none'

				for (var directive_name in csp_parsed) {

					ignore_unsafe_inline = false;
					if (directive_name == 'script-src' || directive_name == 'style-src') {
						for (var k = 0, l = (csp_parsed[directive_name].length); k < l; k++) {
							option = csp_parsed[directive_name][k];
							if (option['value_nonce']) {
								ignore_unsafe_inline = 'nonce';
							} else if (option['value_hash']) {
								ignore_unsafe_inline = 'hash';
							}
						}
					}

					for (var k = 0, l = (csp_parsed[directive_name].length); k < l; k++) {

						option = csp_parsed[directive_name][k];
						notes = [];
						ignored = false;
						used = null;

						if (directive_name == 'require-sri-for') {

							// Could check for script/style if any browsers ever implement this directive.

						} else if (directive_name == 'plugin-types') {

							// Nothing to check?

						} else if (directive_name == 'report-uri') {

							// Nothing to check?

						} else if (directive_name == 'report-to') {

							// Nothing to check?

						} else if (directive_name == 'trusted-types') {

							// https://github.com/w3c/webappsec-trusted-types/issues/235

							// if (current_content && current_content['trusted_types'] && current_content['trusted_types'].includes(option['value'])) {
							//
							// 	notes.push({
							// 			'type': 'matches',
							// 			'matches': [{
							// 					'url': 'N/A',
							// 				}],
							// 		});
							//
							// } else if (option['value_keyword'] != 'none') {
							//
							// 	notes.push({
							// 			'type': 'warning',
							// 			'text': 'Not used',
							// 		});
							//
							// 	csp_warning_count++;
							//
							// }

						} else if (current_content) { // Looking at the main request.

							if (option['value_keyword'] == 'unsafe-inline') {

								if (ignore_unsafe_inline) {

									notes.push({
											'type': 'info',
											'text': 'Ignored due to ' + ignore_unsafe_inline,
										});

									ignored = true;

								} else {

									notes.push({
											'type': 'warning',
											'text': 'Avoid',
										});

									csp_warning_count++;

								}

							} else if (option['matches'].length > 0) {

								notes.push({
										'type': 'matches',
										'matches': option['matches'],
									});

							} else if (option['value'] == 'data:' && allow_data.includes(directive_name)) {

								// Is there a way to realistically determine if this is used?
								// Keep in mind some accessibility extensions inject fonts with 'data:' URIs

							} else if (directive_name == 'form-action' && option['value_keyword'] == 'self') {

								// Don't complain about this not being used (e.g. no forms on the page)... yet.

							} else if (option['value_nonce']) {

								// Cannot read the nonce from the page, so just assume it's being used... document.querySelector('style[nonce]').getAttribute('nonce')

							} else if (option['value_hash']) {

								// Too complicated to get the hash from all external resources, and inline scripts.

							} else if (option['value_keyword'] != 'none' && option['value_keyword'] != 'strict-dynamic') {

								notes.push({
										'type': 'warning',
										'text': 'Not used',
									});

								csp_warning_count++;

								used = false;

							}

							if (option['value_keyword'] == 'self' && !allow_self.includes(directive_name) && used !== false) {

									//--------------------------------------------------
									// As in, put all CSS in one folder, JS in another, etc.
									// And specify all URLs in frame-src.
									//
									// Evil example of using a CSS file in a frame:
									//
									//   frame = document.createElement('iframe');
									//   frame.src = '/css/example.css';
									//   document.body.appendChild(frame);
									//
									//   script = document.createElement('script');
									//   script.src = '//example.com/evil.js';
									//   frames[0].document.head.appendChild(script);
									//
									//--------------------------------------------------

								notes.push({
										'type': 'warning',
										'text': 'Use path limit',
									});

								csp_warning_count++;

							}

						} else { // Sub-resource

							if (option['value_keyword'] != 'none') {

								notes.push({
										'type': 'warning',
										'text': 'Sub-responses should specify \'none\'',
									});

								csp_warning_count++;

							}

						}

						csp_parsed[directive_name][k]['ignored'] = ignored;
						csp_parsed[directive_name][k]['notes'] = notes;

					}
				}

			//--------------------------------------------------
			// Return

				return {
						'parsed': csp_parsed,
						'warning_count': (csp_warning_overview.length + csp_warning_count),
						'warning_overview': csp_warning_overview,
					};

		}

	//--------------------------------------------------
	// PP Parsing

		dev_headers.pp_parse = function(pp_content, current_origin, current_content, current_responses, current_extra_responses) {

			//--------------------------------------------------
			// Initial

				var pp_parsed = dev_headers.policy_parse(pp_content, current_origin),
					pp_warning_count = 0,
					pp_warning_overview = [];

			//--------------------------------------------------
			// Add missing

				var policy_name;

				if (current_content && current_content['permissions_policies']) {
					for (var k = (current_content['permissions_policies'].length - 1); k >= 0; k--) {

						policy_name = current_content['permissions_policies'][k];

						if (!pp_parsed[policy_name]) {

							pp_parsed[policy_name] = [{
									'value': '',
									'value_short': '',
									'value_url': null,
									'value_keyword': null,
									'matches': [],
									'notes': [{
											'type': 'warning',
											'text': 'Not Set'
										}],
								}];

							pp_warning_count++;

						}

					}
				}

			//--------------------------------------------------
			// Return

				return {
						'parsed': pp_parsed,
						'warning_count': (pp_warning_overview.length + pp_warning_count),
						'warning_overview': pp_warning_overview,
					};

		}

	//--------------------------------------------------
	// Header cleanup

		function header_cleanup(tab_id) {

			var response_main = null,
				response,
				headers,
				header_name,
				header_value;

			if (tab_responses[tab_id]) {
				for (var id in tab_responses[tab_id]) {

					response = tab_responses[tab_id][id];

					if (response['type'] == 'main_frame') {
						response_main = id;
					}

					if (!response['responseHeadersClean']) {
						headers = {};
						for (var k = (response['responseHeaders'].length - 1); k >= 0; k--) {
							header_name = response['responseHeaders'][k].name.trim().toLowerCase();
							header_value = response['responseHeaders'][k].value.trim();
							if (headers[header_name]) {
								headers[header_name] += '; ' + header_value;
							} else {
								headers[header_name] = header_value;
							}
						}
						tab_responses[tab_id][id]['responseHeadersClean'] = headers;
					}

				}
			}

			return response_main;

		}

	//--------------------------------------------------
	// Icon update

		function icon_image_update(tab_id, enabled, incognito) {

			if (typeof incognito === 'undefined') {
				incognito = (tab_incognito[tab_id] ? tab_incognito[tab_id] : false);
			}

			var icon_colour = 'BBBBBB';

			if (enabled) {
				icon_colour = (incognito ? 'F1F3F4' : '000000');
			}

			browser.action.setIcon({
					'path': {
							'16': 'icons/' + icon_colour + '/16.png',
							'24': 'icons/' + icon_colour + '/24.png',
							'32': 'icons/' + icon_colour + '/32.png'
						},
					'tabId': tab_id
				});

		}

		function icon_text_update(tab_id, icon_text) {

			var response_main,
				headers,
				icon_count;

			if (typeof icon_text === 'undefined') {

				icon_count = 0;

				if (tab_responses[tab_id]) {

					response_main = header_cleanup(tab_id);

					if (response_main) {
						headers = tab_responses[tab_id][response_main]['responseHeadersClean'];
						for (var k = (header_details.length - 1); k >= 0; k--) {
							if (!headers[header_details[k]['name_lower']]) {
								icon_count++; // Can only really check main response, as we are not notified about resource in the "in-memory cache".
							}
						}
					}

				}

				icon_text = (icon_count > 0 ? icon_count.toString() : '');

			}

			browser.action.setBadgeText({
					'text': icon_text,
					'tabId': tab_id,
				});

		}

		function icon_text_update_delayed(tab_id) {

			if (icon_text_timeout) {
				clearTimeout(icon_text_timeout);
			}

			icon_text_timeout = setTimeout(function() {
					icon_text_update(tab_id);
				}, 300);

		}

	//--------------------------------------------------
	// Get details

		function update_popup_error(message) {
			browser.runtime.sendMessage({'target': 'popup', 'action': 'error', 'message': message});
		}

		function update_popup_complete(config, current_content, response_main, responses, extra_responses) {

			//--------------------------------------------------
			// Simple list of origins this extension has been
			// setup for... but do not provide their config, as
			// the 'key' could be sensitive.

				var origins = [];

				for (var origin in dev_config['origins']) {
					origins.push({
							'url': origin,
							'name': origin.replace(/https?:\/\//, '').split('.').reverse().join('.'),
							'enabled': dev_config['origins'][origin]['enabled'], // Do not send the 'key'
						});
				}

				origins.sort(function(a, b) {
						if (a.name < b.name) {
							return -1;
						} else if (a.name > b.name) {
							return 1;
						}
						return 0;
					});

			//--------------------------------------------------
			// Overview warnings for the page

				var overview_warnings = [];

				if (current_content) {

					if (current_content['link_noopener'].length > 0) {
						overview_warnings.push('There are target="_blank" links on this page without rel="noopener"');
					}

				}

			//--------------------------------------------------
			// Send to popup

					 // browser.tabs.sendMessage only sends to content scripts.

				browser.runtime.sendMessage({
						'target': 'popup',
						'action': 'populate',
						'response': {
								'header_details': header_details,
								'origins': origins,
								'tab_id': popup_tab_id,
								'origin': popup_origin,
								'config': config,
								'responses': responses,
								'response_main': response_main,
								'extra_responses': extra_responses,
								'overview_warnings': overview_warnings,
							}
					});

		}

		function update_popup_start(current_content) {

			//--------------------------------------------------
			// Origin config

				var config = null;
				if (dev_config['origins'][popup_origin]) {
					config = dev_config['origins'][popup_origin];
				}

			//--------------------------------------------------
			// If disabled, or has no responses to process

				if (!config || !config['enabled'] || !popup_tab_id || !tab_responses[popup_tab_id]) {
					update_popup_complete(config);
					return;
				}

			//--------------------------------------------------
			// Responses logged for this tab

				var response_main = header_cleanup(popup_tab_id), // Will also set 'responseHeadersClean' (if not already set).
					responses = tab_responses[popup_tab_id];

			//--------------------------------------------------
			// Resources that were identified by the content-script,
			// as the "very fast in-memory cache" can hide these.

				var extra_responses = [],
					extra_promises = [],
					content_types = {
							'text/css':                 'stylesheet',
							'text/javascript':          'script',
							'application/javascript':   'script',
							'application/x-javascript': 'script',
							'image/gif':                'image',
							'image/jpg':                'image',
							'image/jpeg':               'image',
							'image/png':                'image',
							'image/svg':                'image',
							'image/svg+xml':            'image',
							'image/x-icon':             'image',
							'image/vnd.microsoft.icon': 'image',
							'image/webp':               'image',
							'video/webm':               'media',
							'video/mp4':                'media',
							'font/woff':                'font',
							'font/woff2':               'font',
							'application/font-woff':    'font',
							'application/font-woff2':   'font',
						};

				if (current_content && current_content['resource_urls']) {

					var known_urls = Object.values(responses).map(function(value, index) { return value['url'] }),
						url;

					for (var k = (current_content['resource_urls'].length - 1); k >= 0; k--) {
						url = current_content['resource_urls'][k];
						if (!known_urls.includes(url)) {

							known_urls.push(url);

							extra_promises.push(fetch(url).then(function(response) { // Do not use {'method': 'HEAD'}, as the cache works for this script as well.

									var content_type = response.headers.get('content-type').replace(/;.*/, '').toLowerCase(),
										url,
										details,
										header_name,
										header_value;

									if (!content_types[content_type]) {

										console.log('Unknown resource type: ' + response.url + ' (' + content_type + ')');

									} else {

										url = new URL(response.url); // Already known to be parsable URLs

										details = {
												'url': url.href,
												'local': (url.origin == popup_origin),
												'type': content_types[content_type],
												'headers': {},
												'responseHeadersClean': false,
												'responseCSP': null,
												'responsePP': null,
											};

										for (var k = (header_details.length - 1); k >= 0; k--) {

											header_name = header_details[k]['name_lower'];
											header_value = response.headers.get(header_name);

											if (header_value) {

												details['headers'][header_name] = header_value;

												if (header_name == 'content-security-policy') {
													details['responseCSP'] = dev_headers.csp_parse(header_value, popup_origin);
												}

												if (header_name == 'permissions-policy') {
													details['responsePP'] = dev_headers.pp_parse(header_value, popup_origin);
												}

											}

										}

										extra_responses.push(details);

									}

								}));

						}
					}

				}

			//--------------------------------------------------
			// When we get all of the extra files

				Promise.all(extra_promises).then(function() {

					//--------------------------------------------------
					// CSP and PP parsing

								// This is for the normal responses, the extra_responses (via fetch) have been done above.
								// Done now, as we should know `response_main` (e.g. for CSP to get the Manifest URL).

							var response, header_value;

							for (var id in responses) {

								response = responses[id];
								responses[id]['responseCSP'] = null;
								responses[id]['responsePP'] = null;

								if (response['responseHeadersClean']) {

									if (response['responseHeadersClean']['content-security-policy']) {

										header_value = response['responseHeadersClean']['content-security-policy'];

										if (id == response_main) {
											responses[id]['responseCSP'] = dev_headers.csp_parse(header_value, popup_origin, current_content, responses, extra_responses);
										} else {
											responses[id]['responseCSP'] = dev_headers.csp_parse(header_value, popup_origin);
										}

									}

									if (response['responseHeadersClean']['permissions-policy']) {

										header_value = response['responseHeadersClean']['permissions-policy'];

										if (id == response_main) {
											responses[id]['responsePP'] = dev_headers.pp_parse(header_value, popup_origin, current_content, responses, extra_responses);
										} else {
											responses[id]['responsePP'] = dev_headers.pp_parse(header_value, popup_origin);
										}

									}

								}

							}

						//--------------------------------------------------
						// Return

							update_popup_complete(config, current_content, response_main, responses, extra_responses);

					});

		}

	//--------------------------------------------------
	// Request events

		function request_event_log_headers(details) {
			request_event_log(details, true);
		}

		function request_event_log_complete(details) {
			request_event_log(details, false);
		}

		function request_event_log(details, headers) {

			var tab_id = details.tabId;

			if (tab_id == -1) { // Set to -1 if the request isn't related to a tab - e.g. opening extension popup window, and the `fetch()` call re-requests the resources to get the missing headers.
				return;
			}

				// This function is not called when files come from
				// the "very fast in-memory cache", and it's too slow
				// if the following is called in onBeforeSendHeaders
				// for the 'main_frame'...
				//     browser.webRequest.handlerBehaviorChanged();

			if (headers && details.type == 'main_frame') { // New page load - clear the list of old responses, and enable the icon.

				tab_responses[tab_id] = {};
				tab_enabled_new[tab_id] = true;

			} else if (!tab_responses[tab_id]) {

				tab_responses[tab_id] = {};

			}

			tab_responses[tab_id][details.requestId] = details;

			icon_text_update_delayed(tab_id);

		}

	//--------------------------------------------------
	// Config store, and apply.

		function dev_config_apply(save) {

			//--------------------------------------------------
			// Cleanup

				if (!dev_config['origins']) {
					dev_config['origins'] = {};
				}

				if (save) {
					browser.storage.local.set({'dev_config': JSON.stringify(dev_config)});
				}

			//--------------------------------------------------
			// URLs to Observe

				var listen_urls = [];

				for (var origin in dev_config['origins']) {
					if (dev_config['origins'][origin]['enabled']) {
						listen_urls.push(origin + '/*');
					}
				}

				browser.webRequest.onHeadersReceived.removeListener(request_event_log_headers);
				browser.webRequest.onCompleted.removeListener(request_event_log_complete);

				if (listen_urls.length > 0) {
					browser.webRequest.onHeadersReceived.addListener(request_event_log_headers, {'urls': listen_urls}, ['responseHeaders']); // Request starting, useful for videos that probably won't complete downloading.
					browser.webRequest.onCompleted.addListener(request_event_log_complete,      {'urls': listen_urls}, ['responseHeaders']); // Request completed, to include cached responses (and note it was cached via 'fromCache').
				}

			//--------------------------------------------------
			// Domains to set the X-Dev-Key header

				var header_rules = [],
					k = 1;

				for (var origin in dev_config['origins']) {
					if (dev_config['origins'][origin]['enabled'] && dev_config['origins'][origin]['key']) {

						header_rules.push({
								'id': k++,
								'action': {
									'type': 'modifyHeaders',
									'requestHeaders': [
										{
											'header': 'X-Dev-Key',
											'operation': 'set', // Just to note that 'append' does not work https://crbug.com/1117475
											'value': dev_config['origins'][origin]['key']
										}
									]
								},
								'condition': {
									'requestDomains': [ origin.replace(/^[a-z]+:\/\//, '') ], // Remove the https://
									'resourceTypes': [ 'main_frame' ]
								}
							});

					}
				}

				browser.declarativeNetRequest.getDynamicRules(function(old_rules) {
						var old_rule_ids = old_rules.map(function(rule) { return rule.id });
						browser.declarativeNetRequest.updateDynamicRules({'removeRuleIds': old_rule_ids, 'addRules': header_rules});
					});

		}

	//--------------------------------------------------
	// Browser setup

		if (browser) {

			browser.storage.local.get(['dev_config'], function(result) {
					if (result['dev_config']) {
						dev_config = JSON.parse(result['dev_config']);
					}
					dev_config_apply(false);
				});

			browser.tabs.onUpdated.addListener(function(tab_id, change_info, tab_info) {

					if (change_info.status) {

						var browser = (chrome || browser),
							icon_enabled = null,
							icon_colour,
							resources_loaded = (typeof tab_enabled_new[tab_id] != 'undefined');

						if (change_info.status == 'loading') { // Loading will often happen after the onBeforeSendHeaders for 'main_frame'.

							browser.action.setBadgeText({'text': '', 'tabId': tab_id}); // Just clear the badge text.

							if (resources_loaded) { // Already got some resources loaded, enable now.

								icon_enabled = true;

							} else if (tab_enabled_old[tab_id] == true) { // Last page was enabled, probably should still be enabled... try to reduce flicker by re-enabling it now (as soon as we can).

								icon_enabled = true;

									// TODO: Flicker issue...
									//   https://crbug.com/1029367
									//   https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/browserAction/setIcon
									//   "tabId - Sets the icon only for the given tab. The icon is reset when the user navigates this tab to a new page."
									//   "windowId" would fix this, along with browser.tabs.onActivated/onDetached/etc, but not supported in Chrome.

							}

						} else if (change_info.status == 'complete') {

							if (tab_enabled_old[tab_id] != resources_loaded) {
								icon_enabled = resources_loaded; // Only update icon if the value has changed.
							}

							delete tab_enabled_new[tab_id];

						}

						if (icon_enabled !== null) {

							icon_image_update(tab_id, icon_enabled, tab_info.incognito);

							tab_enabled_old[tab_id] = icon_enabled;

						}

					}

				});

			browser.tabs.onRemoved.addListener(function(tab_id) {

					delete tab_responses[tab_id];
					delete tab_incognito[tab_id];
					delete tab_enabled_new[tab_id];
					delete tab_enabled_old[tab_id];

					popup_tab_id = null;
					popup_origin = null;

				});

			browser.runtime.onMessage.addListener(function(data, sender) {

					if (sender.id !== browser.runtime.id) {
						console.log('Invalid Sender ID');
						return;
					} else if (data.target !== 'background') {
						return;
					}

					if (data.action == 'log') {

						console.log(data.message);

					} else if (data.action == 'open') {

						browser.tabs.query({'active': true, 'currentWindow': true}, function(tabs) {

								if (tabs.length != 1) {
									console.log('Could not determine the current tab.');
									return;
								}

								popup_tab_id = tabs[0].id;

								var url = new URL(tabs[0].url);
								if (url.origin) {
									popup_origin = url.origin; // We do not trust the popup window to tell us their origin
								} else {
									update_popup_error('Could not determine the current origin.');
									return;
								}

								browser.scripting.executeScript({
										target: {
											'tabId': popup_tab_id
										},
										files: ['content-script.js']
									}); // Cannot use callback, as this script can sometimes take too long (the message port closed).

							});

					} else if (data.action == 'enable') {

						if (!popup_origin) {
							console.log('Unknown popup origin');
						}

						delete tab_responses[popup_tab_id];

						if (!dev_config['origins'][popup_origin]) {

							var key_array = new Uint32Array(3);
							crypto.getRandomValues(key_array);

							dev_config['origins'][popup_origin] = {
									'key': key_array.join('-'),
								};

						}

						dev_config['origins'][popup_origin]['enabled'] = true;

						dev_config_apply(true);

					} else if (data.action == 'content') {

						if (!popup_origin) {
							console.log('Unknown popup origin');
						}

						update_popup_start(data.info);

					} else if (data.action == 'key') {

						if (!popup_origin) {
							console.log('Unknown popup origin');
						}

						dev_config['origins'][popup_origin]['key'] = data.key; // Disable by setting the key to ''

						dev_config_apply(true);

					} else if (data.action == 'disable' || data.action == 'remove') {

						if (!popup_origin) {
							console.log('Unknown popup origin');
						}

						if (data.action == 'remove') {

							delete dev_config['origins'][popup_origin];

						} else {

							dev_config['origins'][popup_origin]['enabled'] = false;

						}

						dev_config_apply(true);

						icon_image_update(popup_tab_id, false);

						icon_text_update(popup_tab_id, '');

						delete tab_responses[popup_tab_id];
						delete tab_incognito[popup_tab_id];
						delete tab_enabled_new[popup_tab_id];
						delete tab_enabled_old[popup_tab_id];

					} else {

						console.log('Unknown');

					}

				});

		}

})();
