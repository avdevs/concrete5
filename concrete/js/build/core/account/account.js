/* User Profile Functionality */

ccm_enableUserProfileMenu = function() {
	var container = $('#ccm-account-menu-container'),
		account = $('#ccm-account-menu');
	if (account.length) {
		if (container.length == 0) {
			var container = $('<div />').appendTo(document.body);
		}
		container.addClass('ccm-ui').attr('id', 'ccm-account-menu-container');
		$('#ccm-account-menu').appendTo(container);

		var documentHeight = $(document).height(),
			position = $('#ccm-account-menu').offset().top;

		if ((documentHeight > 200) && ((documentHeight - position) < 200)) {
			$('#ccm-account-menu').addClass('dropup');
		}
	}
}