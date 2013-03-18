/** 
 * concrete5 in context editing
 */

var CCMEditMode = function() {

	setupMenus = function() {
		$('.ccm-area').ccmmenu();
		$('.ccm-block-edit').ccmmenu();
		$('.ccm-block-edit-layout').ccmmenu();
	}

	saveAreaArrangement = function(cID, arHandle) {
	
		if (!cID) {
			cID = CCM_CID;
		}

		var serial = '';
		var $area = $('div.ccm-area[data-area-handle=' + arHandle + ']');
		areaStr = '&area[' + $area.attr('id').substring(1) + '][]=';

		$area.find('div.ccm-block-edit').each(function() {
			serial += areaStr + $(this).attr('data-block-id');
		});

	 	$.ajax({
	 		type: 'POST',
	 		url: CCM_DISPATCHER_FILENAME,
	 		data: 'cID=' + cID + '&ccm_token=' + CCM_SECURITY_TOKEN + '&btask=ajax_do_arrange' + serial
	 	});
	}

	parseBlockResponse = function(r, currentBlockID, task) {
		try { 
			r = r.replace(/(<([^>]+)>)/ig,""); // because some plugins add bogus HTML after our JSON requests and screw everything up
			resp = eval('(' + r + ')');
			if (resp.error == true) {
				var message = '<ul>'
				for (i = 0; i < resp.response.length; i++) {						
					message += '<li>' + resp.response[i] + '<\/li>';
				}
				message += '<\/ul>';
				ccmAlert.notice(ccmi18n.error, message);
			} else {
				jQuery.fn.dialog.closeTop();
				$(document).trigger('blockWindowAfterClose');
				if (resp.cID) {
					cID = resp.cID; 
				} else {
					cID = CCM_CID;
				}
				var action = CCM_TOOLS_PATH + '/edit_block_popup?cID=' + cID + '&bID=' + resp.bID + '&arHandle=' + encodeURIComponent(resp.arHandle) + '&btask=view_edit_mode';	 
				$.get(action, 		
					function(r) { 
						if (task == 'add') {
							if ($('#ccm-add-new-block-placeholder').length > 0) {
								$('#ccm-add-new-block-placeholder').before(r).remove();
								saveAreaArrangement(cID, resp.arHandle);
							} else {
								$("#a" + resp.aID + " div.ccm-area-footer").before(r);
							}
						} else {
							$('[data-block-id=' + currentBlockID + '][data-area-id=' + resp.aID + ']').before(r).remove();
						}
						setupMenus();
						CCMInlineEditMode.exit();
						CCMToolbar.disableDirectExit();
						jQuery.fn.dialog.hideLoader();
						if (task == 'add') {
							var tb = parseInt($('[data-area-id=' + resp.aID + ']').attr('data-total-blocks'));
							$('[data-area-id=' + resp.aID + ']').attr('data-total-blocks', tb + 1);
							ccmAlert.hud(ccmi18n.addBlockMsg, 2000, 'add', ccmi18n.addBlock);
							jQuery.fn.dialog.closeAll();
						} else {
							ccmAlert.hud(ccmi18n.updateBlockMsg, 2000, 'success', ccmi18n.updateBlock);
						}
						if (typeof window.ccm_parseBlockResponsePost == 'function') {
							ccm_parseBlockResponsePost(resp);
						}
					}
				);
			}
		} catch(e) { 
			ccmAlert.notice(ccmi18n.error, r); 
		}
	}
	addBlockType = function(cID, aID, arHandle, $link, fromdrag) {
		var btID = $link.attr('data-btID');
		var inline = parseInt($link.attr('data-supports-inline-editing'));
		var hasadd = parseInt($link.attr('data-has-add-template'));

		if (!hasadd) {
			var action = CCM_DISPATCHER_FILENAME + "?cID=" + cID + "&arHandle=" + encodeURIComponent(arHandle) + "&btID=" + btID + "&mode=edit&processBlock=1&add=1&ccm_token=" + CCM_SECURITY_TOKEN;
			$.get(action, function(r) { parseBlockResponse(r, false, 'add'); })
		} else if (inline) {
			CCMInlineEditMode.loadAdd(cID, arHandle, aID, btID);
		} else {
			jQuery.fn.dialog.open({
				onClose: function() {
					$(document).trigger('blockWindowClose');
					if (fromdrag) {
						jQuery.fn.dialog.closeAll();
						var ccm_blockTypeDropped = false;
					}
				},
				modal: false,
				width: parseInt($link.attr('data-dialog-width')),
				height: parseInt($link.attr('data-dialog-height')) + 20,
				title: $link.attr('data-dialog-title'),
				href: CCM_TOOLS_PATH + '/add_block_popup?cID=' + cID + '&btID=' + btID + '&arHandle=' + encodeURIComponent(arHandle)
			});
		}
	}

	setupBlockMovement = function() {
		
		var $dropelement;
		
		$('div.ccm-area').sortable({
			items: 'div.ccm-block-edit',
			connectWith: 'div.ccm-area',
			placeholder: "ccm-block-type-drop-holder",
			opacity: 0.4,
			over: function(e, ui) {
				$(this).addClass('ccm-area-drag-over');
				var w = $(this).width();
				$(ui.helper).css('width', w + 'px');
				return true;
			},
			out: function() {
				$(this).removeClass('ccm-area-drag-over');
			},
			receive: function(e, ui) {
				$dropelement = ui.item;
			}

		});
		$('div.ccm-block-edit').each(function() {
			var $li = $(this);
			var $sortables = $('div.ccm-area[data-accepts-block-types~=' + $li.attr('data-block-type-handle') + ']');
			$li.draggable({
				helper: function() {
					var w = $(this).width();
					var h = $(this).height();
					var $d =  $('<div />', {'class': 'ccm-block-type-dragging'}).css('width', w).css('height', h);
					return $d;
				},
				start: function(e, ui) {
					$sortables.addClass('ccm-area-drag-active');
				},
				handle: '[data-inline-command=move-block]',
				
				stop: function(e, ui) {
					if ($dropelement) {
						$dropelement.remove();
						$dropelement = false;
					}
					$sortables.removeClass('ccm-area-drag-active');
		 			$("div.ccm-block-edit").removeClass('ccm-block-arrange-enabled');
		 			$('div.ccm-block-edit').draggable().draggable('destroy');

				},
				connectToSortable: $sortables
			});
		});
	}

	return {
		start: function() {
			
			setupMenus();
			//setupBlockMovement();

		},

		setupBlockForm: function(form, bID, task) {
			form.ajaxForm({
				type: 'POST',
				iframe: true,
				beforeSubmit: function() {
					$('input[name=ccm-block-form-method]').val('AJAX');
					jQuery.fn.dialog.showLoader();
					if (typeof window.ccmValidateBlockForm == 'function') {
						r = window.ccmValidateBlockForm();
						if (ccm_isBlockError) {
							jQuery.fn.dialog.hideLoader();
							if(ccm_blockError) {
								ccmAlert.notice(ccmi18n.error, ccm_blockError + '</ul>');
							}
							ccm_resetBlockErrors();
							return false;
						}
					}
				},
				success: function(r) {
					parseBlockResponse(r, bID, task);
				}
			});
		},

		deleteBlock: function(cID, bID, aID, arHandle, msg) {
			if (confirm(msg)) {
				CCMToolbar.disableDirectExit();
				// got to grab the message too, eventually
				$d = $('[data-block-id=' + bID + '][data-area-id=' + aID + ']');
				$d.hide().remove();
				$.fn.ccmmenu.resethighlighter();
				ccmAlert.hud(ccmi18n.deleteBlockMsg, 2000, 'delete_small', ccmi18n.deleteBlock);
				var tb = parseInt($('[data-area-id=' + aID + ']').attr('data-total-blocks'));
				$('[data-area-id=' + aID + ']').attr('data-total-blocks', tb - 1);
				$.ajax({
					type: 'POST',
					url: CCM_DISPATCHER_FILENAME,
					data: 'cID=' + cID + '&ccm_token=' + CCM_SECURITY_TOKEN + '&isAjax=true&btask=remove&bID=' + bID + '&arHandle=' + arHandle
				});
				if (typeof window.ccm_parseBlockResponsePost == 'function') {
					ccm_parseBlockResponsePost({});
				}
			}	
		},

		activateBlockTypesOverlay: function() {
			$('#ccm-dialog-block-types-sets ul a').on('click', function() {
				$('#ccm-overlay-block-types li').hide();
				$('#ccm-overlay-block-types li[data-block-type-sets~=' + $(this).attr('data-tab') + ']').show();
				$('#ccm-dialog-block-types-sets ul a').removeClass('active');
				$(this).addClass('active');
			});

			$($('#ccm-dialog-block-types ul a').get(0)).trigger('click');

			$('#ccm-dialog-block-types').closest('.ui-dialog-content').addClass('ui-dialog-content-block-types');
			$('#ccm-block-type-search input').focus();
			if ($('#ccm-block-types-dragging').length == 0) {
				$('<div id="ccm-block-types-dragging" />').appendTo(document.body);
			}
			// remove any old add block type placeholders
			$('#ccm-add-new-block-placeholder').remove();
			$('#ccm-block-type-search input').liveUpdate('ccm-overlay-block-types');
			
			$('#ccm-block-type-search input').on('keyup', function() {
				if ($(this).val() == '') {
					$('#ccm-block-types-wrapper ul.nav-tabs').css('visibility', 'visible');
					$('#ccm-block-types-wrapper ul.nav-tabs li[class=active] a').click();
				} else {
					$('#ccm-block-types-wrapper ul.nav-tabs').css('visibility', 'hidden');
				}
			});

			// add droppables for empty areas.
			var $emptyareas = $('div.ccm-area[data-total-blocks=0]');

			var dropSuccessful = false;
			$('#ccm-overlay-block-types a.ccm-overlay-draggable-block-type').each(function() {
				var $li = $(this);
				$li.css('cursor', 'move');
				$li.draggable({
					helper: 'clone',
					appendTo: $('#ccm-block-types-dragging'),
					revert: false,
					start: function(e, ui) {
						// handle the dialog
						$('#ccm-block-types-wrapper').parent().jqdialog('option', 'closeOnEscape', false);
						$('#ccm-overlay-block-types').closest('.ui-dialog').fadeOut(100);
						$('.ui-widget-overlay').remove();

						// deactivate the menu on drag
						$.fn.ccmmenu.disable();

						// drop into empty areas.
						var $droppables = $emptyareas.filter('[data-accepts-block-types~=' + $li.attr('data-block-type-handle') + ']');
						$droppables.droppable({
							hoverClass: 'ccm-area-drag-block-type-over',
							accept: 'a.ccm-overlay-draggable-block-type',
							drop: function(e, ui) {
								dropSuccessful = true;
								addBlockType($(this).attr('data-cID'), $(this).attr('data-area-id'), $(this).attr('data-area-handle'), ui.helper, true);
							}
						});

						// add in block type dividers.
						$('div.ccm-area[data-accepts-block-types~=' + $li.attr('data-block-type-handle') + '][data-total-blocks!=0]').addClass('ccm-area-accepts-blocks').each(function() {
							// before each block
							$('<div />', {'class': 'ccm-block-type-drop-zone', 'data-accepts-block-types': $(this).attr('data-accepts-block-types')}).insertBefore($(this).find('.ccm-block-edit'));
							$('<div />', {'class': 'ccm-block-type-drop-zone', 'data-accepts-block-types': $(this).attr('data-accepts-block-types')}).insertBefore($(this).find('.ccm-area-footer'));
						});

						$('.ccm-block-type-drop-zone').droppable({
							hoverClass: 'ccm-area-drag-block-type-over',
							accept: 'a.ccm-overlay-draggable-block-type',
							drop: function(e, ui) {
								dropSuccessful = true;
								var $area = $(this).parent();
								$(this).replaceWith($('<div />', {'id': 'ccm-add-new-block-placeholder'}));
								addBlockType($area.attr('data-cID'), $area.attr('data-area-id'), $area.attr('data-area-handle'), ui.helper, true);
							}
						});
					},
					stop: function() {
						$.fn.ccmmenu.enable();
						$('.ccm-block-type-drop-zone').remove();
						if (!dropSuccessful) {
							// this got cancelled without a receive.
							jQuery.fn.dialog.closeAll();
						}
					}
				});
			});

			$('a.ccm-overlay-clickable-block-type').on('click', function() {
				addBlockType($(this).attr('data-cID'), $(this).attr('data-area-id'), $(this).attr('data-area-handle'), $(this));
				return false;
			});
			
			
		}


	}

}();