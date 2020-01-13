
;(function(document, window, undefined) {

	'use strict';

	var browser = (window.chrome || window.browser),
		header_details,
		output_ref,
		tooltip_ref,
		tooltip_rect,
		current_tab_id,
		current_origin,
		current_enabled,
		current_responses,
		current_response_main,
		current_extra_responses,
		current_view,
		overview_warnings,
		overview_table,
		csp_warnings,
		csp_table,
		fp_warnings,
		fp_table,
		key_input;

	function background_send_message(action, data) {
		if (typeof data === 'undefined') {
			data = {};
		}
		data['target'] = 'background';
		data['action'] = action;
		browser.runtime.sendMessage(data);
	}

	function log(message) {
		background_send_message('log', {'message': message});
	}

	function output_message(message) {
		output_reset();
		var p = document.createElement('p');
		p.textContent = message;
		output_ref.appendChild(p);
	}

	function output_reset() {
		while (output_ref.firstChild) {
			output_ref.removeChild(output_ref.firstChild);
		}
	}

	function view_change(e) {
		if (typeof e == 'string') {
			current_view = e;
		} else {
			e.preventDefault();
			current_view = this.getAttribute('href').substr(1);
		}
		document.documentElement.setAttribute('data-view', current_view);
	}

	function request_reload() {
		browser.tabs.reload(current_tab_id, {'bypassCache': true});
	}

	function request_enable() {
		background_send_message('enable');
		request_reload();
	}

	function request_save() {
		background_send_message('key', {'key': key_input.value});
		request_reload();
	}

	function request_disable() {
		background_send_message('disable');
		window.close();
	}

	function request_remove() {
		background_send_message('remove');
		window.close();
	}

	function tooltip_show(e) {

		if (tooltip_ref) {
			tooltip_hide();
		}

		tooltip_ref = document.createElement('div');
		tooltip_ref.setAttribute('class', 'tooltip');

		var text, element, strong;

		text = this.getAttribute('data-header');
		if (text) {
			element = document.createElement('h2');
			element.textContent = text;
			tooltip_ref.appendChild(element);
		}

		text = this.getAttribute('data-value');
		if (text) {
			element = document.createElement('p');
			element.textContent = text;
			tooltip_ref.appendChild(element);
		}

		text = this.parentNode.getAttribute('data-source');
		if (text) {
			strong = document.createElement('strong');
			strong.textContent = text;
			element = document.createElement('p');
			element.appendChild(document.createTextNode('Source: '));
			element.appendChild(strong);
			tooltip_ref.appendChild(element);
		}

		text = parseInt(this.getAttribute('data-warning-count'), 10);
		if (text > 0) {
			strong = document.createElement('strong');
			strong.textContent = text;
			element = document.createElement('p');
			element.appendChild(document.createTextNode('Warnings: '));
			element.appendChild(strong);
			tooltip_ref.appendChild(element);
		}

		text = this.getAttribute('data-matches');
		if (text) {
			text = text.split('|').sort();
			for (var k = 0, l = (text.length); k < l; k++) {
				element = document.createElement('p');
				element.setAttribute('class', 'match');
				element.textContent = text[k];
				tooltip_ref.appendChild(element);
				tooltip_ref.className += ' inc_matches';
			}
		}

		document.documentElement.addEventListener('mousemove', tooltip_move);
		document.documentElement.appendChild(tooltip_ref);

		tooltip_rect = tooltip_ref.getBoundingClientRect();
		tooltip_move(e);

	}

	function tooltip_move(e) {
		if (tooltip_ref) {
			tooltip_ref.style.left = (e.pageX - tooltip_rect.width - 5) + 'px';
			tooltip_ref.style.top = (e.pageY + 5) + 'px';
		}
	}

	function tooltip_hide() {
		if (tooltip_ref) {
			document.documentElement.removeEventListener('mousemove', tooltip_move);
			tooltip_ref.parentNode.removeChild(tooltip_ref);
			tooltip_ref = null;
		}
	}

	function tooltip_setup(el) {
		el.addEventListener('mouseover', tooltip_show);
		el.addEventListener('mouseout', tooltip_hide);
	}

	function update_policy_output(warnings_ref, table_ref, info) {

		//--------------------------------------------------
		// Warnings

			if (warnings_ref) {

				//--------------------------------------------------
				// Reset

					while (warnings_ref.firstChild) {
						warnings_ref.removeChild(warnings_ref.firstChild);
					}

				//--------------------------------------------------
				// Show warnings

					if (info && info.warning_overview.length > 0) {

						var ul = document.createElement('ul'),
							li;

						for (var k = 0, l = (info.warning_overview.length); k < l; k++) {

							li = document.createElement('li');
							li.textContent = info.warning_overview[k];
							ul.appendChild(li);

						}

						warnings_ref.appendChild(ul);

					}

			}

		//--------------------------------------------------
		// Table

			if (table_ref) {

				//--------------------------------------------------
				// Reset

					while (table_ref.firstChild) {
						table_ref.removeChild(table_ref.firstChild);
					}

				//--------------------------------------------------
				// No directives

					if (!info || Object.keys(info.parsed).length == 0) {

						tr = document.createElement('tr');

						td = document.createElement('td');
						td.setAttribute('colspan', 3);
						td.setAttribute('class', 'missing');
						td.textContent = 'Missing';
						tr.appendChild(td);

						table_ref.appendChild(tr);

						return;

					}

				//--------------------------------------------------
				// Populate

					var options,
						option,
						tr,
						td,
						note,
						span;

					for (var directive_name in info.parsed) {

						options = info.parsed[directive_name];

						for (var k = 0, l1 = (options.length); (k < l1 || k == 0); k++) {

							tr = document.createElement('tr');

							td = document.createElement('td');
							td.textContent = (k == 0 ? directive_name : '');
							tr.appendChild(td);

							if (l1 == 0) { // No values, for example 'block-all-mixed-content'

								td = document.createElement('td');
								tr.appendChild(td);

								td = document.createElement('td');
								tr.appendChild(td);

							} else {

								td = document.createElement('td');
								td.textContent = options[k]['value_short'];
								if (options[k]['ignored']) {
									td.setAttribute('class', 'ignored');
								} else if (options[k]['value_keyword']) {
									td.setAttribute('class', 'value_' + options[k]['value_keyword']);
								}
								tr.appendChild(td);

								td = document.createElement('td');
								for (var j = 0, l2 = (options[k]['notes'].length); j < l2; j++) {
									if (j > 0) {
										td.appendChild(document.createTextNode(' - '));
									}
									note = options[k]['notes'][j];
									span = document.createElement('span');
									if (note['type'] == 'matches') {
										span.setAttribute('data-matches', note['matches'].map(function(value, index) {
												return value['url'];
											}).join('|'));
										span.textContent = note['matches'].length;
										tooltip_setup(span);
									} else if (note['type'] == 'info' || note['type'] == 'warning') {
										span.setAttribute('class', note['type']);
										span.textContent = note['text'];
									}
									td.appendChild(span);
								}
								tr.appendChild(td);

							}

							table_ref.appendChild(tr);

						}

					}

			}

	}

	function update_table_focus(e) {

		//--------------------------------------------------
		// Focus

			var focused,
				focus_id;

			if (e) { // Click event on link or tr.
				focused = this;
				while (focused && focused.tagName.toLowerCase() != 'tr') {
					focused = focused.parentNode;
				}
				if (!focused) {
					return;
				}
				focus_id = parseInt(focused.getAttribute('data-request'), 10);
				e.preventDefault();
				e.stopPropagation(); // Don't call twice if clicking on the link (and td).
			} else if (current_response_main) {
				focus_id = current_response_main;
				if (focus_id) {
					focused = overview_table.querySelector('tr[data-request="' + current_response_main + '"]');
				}
			} else {
				focused = overview_table.querySelector('tr[data-request]:first-child');
				if (focused) {
					focus_id = parseInt(focused.getAttribute('data-request'), 10);
				}
			}

			if (!focused) {
				return;
			}

		//--------------------------------------------------
		// Focus indicator

			var last_focused = overview_table.querySelectorAll('tr[data-focused="true"]');
			for (var k = (last_focused.length - 1); k >= 0; k--) {
				last_focused[k].setAttribute('data-focused', 'false');
				last_focused[k].querySelector('td.focus').textContent = ' ';
			}

			focused.setAttribute('data-focused', 'true');
			focused.querySelector('td.focus').textContent = '▶';

		//--------------------------------------------------
		// Update CSP and FP tables

			var response;

			if (focus_id > 0) {
				response = current_responses[focus_id];
			} else {
				response = current_extra_responses[(0 - focus_id)];
			}

			if (response) {

				update_policy_output(csp_warnings, csp_table, response['responseCSP']);
				update_policy_output(fp_warnings,  fp_table,  response['responseFP']);

				if (csp_table) csp_table.setAttribute('data-type', response['type']);
				if (fp_table)  fp_table.setAttribute('data-type', response['type']);

			}

	}

	function update_table_overview() {

		//--------------------------------------------------
		// Cleanup

			if (!overview_table || !current_responses) {
				return;
			}

			while (overview_table.firstChild) {
				overview_table.removeChild(overview_table.firstChild);
			}

		//--------------------------------------------------
		// Determine response order

			var response_order = [];

			for (var id in current_responses) {

				response_order.push({
						'id': id,
						'type': current_responses[id]['type'],
						'url': current_responses[id]['url'],
					});

			}

			for (var k = (current_extra_responses.length - 1); k >= 0; k--) {

				response_order.push({
						'id': (0 - k),
						'type': current_extra_responses[k]['type'],
						'url': current_extra_responses[k]['url'],
					});

			}

			response_order.sort(function(a, b) {
					if (a.type != b.type) {
						if (a.type == 'main_frame') {
							return -1;
						} else if (b.type == 'main_frame') {
							return 1;
						}
					}
					if (a.url < b.url) {
						return -1;
					} else if (a.url > b.url) {
						return 1;
					}
					return 0;
				});

			response_order = response_order.map(function(value, index) {
					return value['id'];
				});

		//--------------------------------------------------
		// Populate overview table

			var id, response, cached, source, url, a, tr, td, td_class, td_data, header_values, header_names, header, td_warning_count, td_good;

			for (var k = 0, l1 = (response_order.length); k < l1; k++) {

				id = response_order[k];

				if (id > 0) {
					response = current_responses[id];
					cached = response['fromCache'];
					source = (response['fromCache'] ? 'Disk Cache' : '');
					header_values = response['responseHeadersClean'];
				} else {
					response = current_extra_responses[(0 - id)];
					cached = (response['local'] == true);
					source = (cached ? 'Memory Cache' : 'External');
					header_values = (response['headers'] ? response['headers'] : null) // Headers collected by doing an extra fetch()
				}

				header_names = (header_values === null ? null : Object.keys(header_values));

				try {
					url = new URL(response['url']);
				} catch (e) {
					url = null;
				}

				tr = document.createElement('tr');
				tr.addEventListener('click', update_table_focus);
				tr.setAttribute('data-request', id);
				tr.setAttribute('data-focused', 'false');
				tr.setAttribute('data-type', response['type']);
				tr.setAttribute('data-cached', (cached ? 'true' : 'false'));
				tr.setAttribute('data-source', source);

				td = document.createElement('td');
				td.setAttribute('class', 'focus');
				td.textContent = ' ';
				tr.appendChild(td);

				a = document.createElement('a');
				a.setAttribute('href', '#');
				a.addEventListener('click', update_table_focus);
				a.textContent = (url && url.origin == current_origin ? '' : url.origin) + url.pathname + url.search;

				td = document.createElement('td');
				td.setAttribute('class', 'path');
				td.appendChild(a);
				tr.appendChild(td);

				for (var j = 0, l2 = (header_details.length); j < l2; j++) {

					header = header_details[j];

					td = document.createElement('td');
					td_class = 'header';
					td_data = '';
					td_warning_count = 0,
					td_good = false;

					if (header_names === null) {

						td.textContent = '-'; // Using a '?' is too noisy... where all of these headers are not available (lost in the "in-memory cache")
						td_class += ' unknown_value';
						td_data = 'Unknown Value';

					} else if (header_names.indexOf(header['name_lower']) != -1) {

						if (header['name_lower'] == 'content-security-policy' && response['responseCSP']) td_warning_count += response['responseCSP']['warning_count'];
						if (header['name_lower'] == 'feature-policy'          && response['responseFP'])  td_warning_count += response['responseFP']['warning_count'];

						if (td_warning_count > 0) {
							td.textContent = '!';
						} else {
							td.textContent = 'Y';
							td_good = true;
						}

						td_data = header_values[header['name_lower']];

					} else if (header['name_lower'] == 'strict-transport-security' && source) {

						td.textContent = ' '; // This header is lost in the cache
						td_data = 'Missing Value, Due to Cache';

					} else if ((header['recommended'] == 'all') || (header['recommended'] == 'main' && current_response_main == id)) {

						td.textContent = 'N';
						td_class += ' recommended_missing';
						td_data = 'Missing Value';

					} else {

						td.textContent = ' ';
						td_data = 'Missing Value';

					}

					td.setAttribute('data-header', header['name']);
					td.setAttribute('data-value', td_data);
					td.setAttribute('data-warning-count', td_warning_count);
					td.setAttribute('data-good', (td_good ? 'true' : 'false'));
					td.setAttribute('class', td_class);
					tr.appendChild(td);

					tooltip_setup(td);

				}

				overview_table.appendChild(tr);

			}

	}

	function update_keydown(e) { // Has to happen on 'down' as the scroll can happen earlier.

		if (current_view == 'view_details') {
			if (e.keyCode == 38 || e.keyCode == 40) { // Up and down arrows to select different responses.

				var current_focus = overview_table.querySelector('tr[data-focused="true"]'),
					new_focus;

				if (current_focus) {
					if (e.keyCode == 38) {
						new_focus = current_focus.previousSibling;
					} else {
						new_focus = current_focus.nextSibling;
					}
					if (new_focus) {
						new_focus.click();
						e.stopPropagation();
					}
				}

			} else if (e.keyCode == 39) { // Right arrow

				view_change('view_setup');

			}
		} else if (current_view == 'view_setup') {
			if (e.keyCode == 37) { // Left arrow

				view_change('view_details');

			}
		}

	}

	function init_populate(response) {

		header_details = response['header_details'];

		current_tab_id = response['tab_id'];
		current_origin = response['origin'];
		current_enabled = (response['config'] && response['config']['enabled']);
		current_responses = response['responses'];
		current_response_main = response['response_main'];
		current_extra_responses = response['extra_responses'];

		output_reset();

		document.documentElement.setAttribute('class', (current_enabled ? 'enabled' : 'disabled'));

		if (current_enabled) {

			//--------------------------------------------------
			// View tabs

				var views = document.querySelectorAll('#enabled > ul.views li a');
				for (var k = (views.length - 1); k >= 0; k--) {
					views[k].addEventListener('click', view_change);
				}

				view_change('view_details');

			//--------------------------------------------------
			// Add overview warnings

				if (overview_warnings) {

					while (overview_warnings.firstChild) {
						overview_warnings.removeChild(overview_warnings.firstChild);
					}

					if (response['overview_warnings'].length > 0) {

						var ul = document.createElement('ul'),
							li;

						for (var k = 0, l = (response['overview_warnings'].length); k < l; k++) {

							li = document.createElement('li');
							li.textContent = response['overview_warnings'][k];
							ul.appendChild(li);

						}

						overview_warnings.appendChild(ul);

					}

				}

			//--------------------------------------------------
			// Add headings to the overview table

				if (overview_table) {

					var tr = overview_table.parentNode.querySelector('thead tr'),
						th = tr.querySelectorAll('th[data-replace="true"]');

					if (th.length > 0) { // Hasn't been updated yet.

						for (var k = (th.length - 1); k >= 0; k--) {
							th[k].parentNode.removeChild(th[k]);
						}

						for (var k = 0, l = (header_details.length); k < l; k++) {
							th = document.createElement('th');
							th.setAttribute('data-abbr', header_details[k]['abbr']);
							th.setAttribute('data-header', header_details[k]['name']);
							th.textContent = header_details[k]['abbr'];
							tr.appendChild(th);
							tooltip_setup(th);
						}

						var tds = overview_table.querySelectorAll('td');
						if (tds.length == 1) {

							tds[0].setAttribute('colspan', (header_details.length + 2)); // Just incase no requests have been found.

							if (!current_responses) {

								var input = document.createElement('input');
								input.setAttribute('type', 'button');
								input.setAttribute('value', 'Reload');
								input.addEventListener('click',  request_reload);
								tds[0].appendChild(document.createTextNode(' '));
								tds[0].appendChild(input);

							}

						}

					}

				}

			//--------------------------------------------------
			// Responses, and populate tables

				if (current_responses) {

					update_table_overview();

					update_table_focus(null); // Focus main or first item, to show CSP and FP

				}

			//--------------------------------------------------
			// Keyboard shortcut to move up/down responses

				document.documentElement.addEventListener('keydown', update_keydown);

			//--------------------------------------------------
			// Show dev header key

				if (key_input) {
					key_input.setAttribute('value', response['config']['key']);
				}

			//--------------------------------------------------
			// Show other origins

				var other_origin_list = document.getElementById('other_origin_list'),
					url,
					li,
					a,
					span;

				if (other_origin_list) {

					while (other_origin_list.firstChild) {
						other_origin_list.removeChild(other_origin_list.firstChild);
					}

					for (var k = 0, l = (response['origins'].length); k < l; k++) {

						li = document.createElement('li');

						if (response['origins'][k]['url'] == current_origin) {
							li.textContent = response['origins'][k]['url'];
							li.setAttribute('class', 'current');
						} else {
							a = document.createElement('a');
							a.setAttribute('href', response['origins'][k]['url']);
							a.setAttribute('target', '_blank');
							a.textContent = response['origins'][k]['url'];
							li.appendChild(a);
						}

						li.setAttribute('data-enabled', (response['origins'][k]['enabled'] ? 'true' : 'false'));
						if (!response['origins'][k]['enabled']) {
							span = document.createElement('span');
							span.textContent = ' - Disabled';
							li.appendChild(span);
						}

						other_origin_list.appendChild(li);

					}

				}

		}

	}

	browser.runtime.onMessage.addListener(function(data, sender) {

			if (sender.id !== browser.runtime.id) {
				log('Invalid Sender ID');
				return;
			} else if (data.target !== 'popup') {
				return;
			}

			if (data.action == 'populate') {

				init_populate(data.response);

			} else if (data.action == 'error') {

				output_message(data.message);

			}

		});

	function init_start() {

		//--------------------------------------------------
		// Output

			output_ref = document.getElementById('output');
			if (!output_ref) {
				return;
			}

			output_message('Loading...');

		//--------------------------------------------------
		// Buttons

			var enable_button  = document.getElementById('button_enable');
			var disable_button = document.getElementById('button_disable');
			var remove_button  = document.getElementById('button_remove');

			if (enable_button)  enable_button.addEventListener('click',  request_enable);
			if (disable_button) disable_button.addEventListener('click', request_disable);
			if (remove_button)  remove_button.addEventListener('click',  request_remove);

		//--------------------------------------------------
		// Key input

			var button_save = document.getElementById('button_save');

			key_input = document.getElementById('key_value');

			if (key_input) {
				key_input.addEventListener('keyup', function(e) {
						if (e.keyCode === 13) {
							request_save();
						}
					});
			}

			if (button_save) {
				if (key_input) {
					button_save.addEventListener('click', request_save);
				} else {
					button_save.parentNode.removeChild(button_save);
				}
			}

		//--------------------------------------------------
		// Extra references

			overview_warnings = document.getElementById('overview_warnings');
			overview_table = document.querySelector('#overview_table tbody');

			csp_warnings = document.getElementById('csp_warnings');
			csp_table = document.querySelector('#csp_table tbody');

			fp_warnings = document.getElementById('fp_warnings');
			fp_table = document.querySelector('#fp_table tbody');

		//--------------------------------------------------
		// Get the background script to get the data.

			background_send_message('open'); // Continue at init_populate()

	}

	if (document.readyState !== 'loading') {
		window.setTimeout(init_start); // Handle asynchronously
	} else {
		document.addEventListener('DOMContentLoaded', init_start);
	}

	browser.tabs.onUpdated.addListener(function(tab_id, change_info) {
			if (change_info.status == 'loading') {
				window.close(); // If the user refreshes the page by keyboard shortcut, cause this window to close.
			}
		});

})(document, window);
