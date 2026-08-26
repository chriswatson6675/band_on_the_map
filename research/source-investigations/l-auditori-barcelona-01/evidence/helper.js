dayjs.extend(window.dayjs_plugin_advancedFormat);

function get_date_format() {
    return 'dd-MM-YYYY HH:mm';
}

function get_param(name) {
    return window['aP' + name];
}

function get_url_param(name) {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    return urlParams.get(name);
}

function get_url_parameters(url) {
    let params = {};
    let parts = (url + '').slice((url + '').indexOf('?') + 1).split('&');

    parts.forEach(part => {
        let [key, value] = part.split('=');
        params[key] = decodeURIComponent(value);
    });

    return params;
}

function get_filter_param(self, name, default_value = "") {
    let param = ls_get(self.parent.name + "_" + name, default_value, 10 * 60 * 1000);
        
    let url_param = get_url_param(name);
    if(url_param) {
        param = url_param;
    }

    return param;
}

function set_filter_param(self, name, value) {
    if(!value) {
        ls_set(self.parent.name + "_" + name, "");
        return;
    }
    
    ls_set(self.parent.name + "_" + name, value);
}

function get_current_lang(href = null) {
    const langs = ['es', 'en', 'ca'];

    if (!href) {
        href = window.location.pathname;
    }

    for (let i in langs) {
        const lang = langs[i];
        if (href.includes('/' + lang + '/')) {
            return lang;
        }
    }

    return 'ca';

}

async function nextTick() {
    await later(0);
}

function later(delay) {
    return new Promise(function(resolve) {
        setTimeout(resolve, delay);
    });
}

function go_selected(selectorId, pre = "", blank = true) {
    let url = pre + jQuery('#' + selectorId).val();
    if (url) {
        navigateTo(url, blank);
    }
}

function go_selected_custom(selector, pre = "", blank = true) {
    let url = pre + jQuery(selector).attr("value");
    if (url) {
        navigateTo(url, blank);
    }
}

function nav_selected(selectorId, pre = "") {
    let url = pre + jQuery('#' + selectorId).val();
    if (url) {
        window.location.href = window.location.href.replace('/ca/', url).replace('/es/', url).replace('/en/', url);
    }
}

function go_selected_param(selector, param, pre = "") {
    let url = pre + jQuery(selector).find('[data-selected="selected"]').attr(param);
    if (url) {
        navigateTo(url, true);
    }
}

function go_selected_param_class(selectorClass, param, pre = "") {
    let url = pre + jQuery('.' + selectorClass).find('[data-selected="selected"]').attr(param);
    if (url) {
        navigateTo(url, true);
    }
}

function send_ajax(funct, data) {
    return new Promise(function(resolve, reject) {
        const cacheable = !!get_url_param('clear_page_object_cache') ? 1 : 0;

        jQuery.ajax({
            type: "post",
            url: aPutilities.ajaxurl,
            data: { action: funct, clear_page_object_cache: cacheable, data },
            success: function(response) {
                resolve(response);
            },
            error: function(error) {
                reject(error);
            }
        });
    });
}

function get_posts(postIds, type) {
    return new Promise(function(resolve, reject) {
        const cacheable = !!get_url_param('clear_page_object_cache') ? 1 : 0;

        jQuery.ajax({
            type: "post",
            url: aPutilities.ajaxurl,
            dataType: "json",
            data: { action: "get_auditori_posts", ids: postIds, type, clear_page_object_cache: cacheable },
            success: function(response) {
                resolve(response);
            },
            error: function(error) {
                console.error(error);
                return false;
            }
        });
    });
}

async function get_post(postId, type) {
    const resp = await get_posts([postId], type);
    if (resp.length == 0) {
        console.error('post expected');
        return null;
    }
    return resp[0];
}

function get_query(query, params) {
    return new Promise(function(resolve, reject) {

        const cacheable = !!get_url_param('clear_page_object_cache') ? 1 : 0;
        const debug = !!get_url_param('debug') ? 1 : 0;

        jQuery.ajax({
            type: "get",
            url: aPutilities.ajaxurl,
            dataType: "json",
            data: { action: query, clear_page_object_cache: cacheable, debug, ...params },
            beforeSend: function(xhr) {

            },
            success: function(response) {
                resolve(response);
            },
            error: function(error) {
                reject(error);
            }
        });
    });
}

function post_query(query, params) {
    return new Promise(function(resolve, reject) {
        const cacheable = !!get_url_param('clear_page_object_cache') ? 1 : 0;

        jQuery.ajax({
            type: "post",
            url: aPutilities.ajaxurl,
            dataType: "json",
            data: { action: query, clear_page_object_cache: cacheable, ...params },
            beforeSend: function(xhr) {

            },
            success: function(response) {
                resolve(response);
            },
            error: function(error) {
                reject(error);
            }
        });
    });
}

function navigateTo(href, blank = false) {
    if (!href) return;
    
    // let url_object = null;
    // if(!href.startsWith('http')) url_object = new URL(href, window.location.host);
    // else url_object = new URL(href);

    // if(url_object.hostname == "entrades.auditori.cat") {
        
    // }

    // if(window.location.hostname == url_object.hostname) {
        let is_anchor = href.replace('http://', '').replace('https://', '').split('#');
        if (is_anchor.length > 1) {
            let current_url = window.location.href.replace('http://', '').replace('https://', '').split('#');
            let current_path = window.location.pathname.split('#');
            if (current_url[0] == is_anchor[0] || is_anchor[0] == '' || is_anchor[0] == current_path) {
                auditori_scrollTo('#' + is_anchor[1]);
                return;
            }
        }
    // }

    // hide menu after navigation
    hideMenu();

    // if (typeof Cookiebot !== 'undefined') {
        const current_lang = get_current_lang();
        const url_lang = get_current_lang(href);

        //if(Cookiebot.consent.stamp == 0 && current_lang != url_lang) {
        if (current_lang != url_lang) {
            window.location.href = href;
            return;
        }
    // }

    if(blank) window.open(href, '_blank').focus();
    else if (barba) barba.go(href);
    else window.location.href = href;
}

function unescapeHTML(escapedHTML) {
    return escapedHTML.replaceAll(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function preserveEndlines(html) {
    return html.replace(/\n/g, '<br>\n');
}

function syncHoverSelect(selectorParent, selectorChilds, classToAdd, onEnter = null, onLeave = null) {
    let main = jQuery('.a-body');

    if (!Array.isArray(selectorChilds)) {
        selectorChilds = [selectorChilds];
    }

    main.on('click', selectorParent + ' a', function(e) {
        e.preventDefault();
    });

    main.on('click', selectorParent, function() {
        let location = jQuery(this).find('a').attr('href');
        navigateTo(location);
    });

    main.on('mouseenter', selectorParent, function(e) {
        let card = jQuery(this);
        selectorChilds.forEach((selectorChild) => card.find(selectorChild).addClass(classToAdd));
        card.find('img').css('opacity', 0.95);
        if (onEnter) onEnter();
    });

    main.on('mouseleave', selectorParent, function(e) {
        let card = jQuery(this);
        selectorChilds.forEach((selectorChild) => card.find(selectorChild).removeClass(classToAdd));
        card.find('img').css('opacity', 1);
        if (onLeave) onLeave();
    });
}

function switchButton(element) {
    let clickedElement = jQuery(element);
    let parentElement = jQuery(element).parent().closest('div[a-options]');

    let classes = parentElement.attr('a-option-selected-classes');
    let selected = false;

    if (clickedElement.hasClass(classes)) {
        clickedElement.removeClass(classes);
    } else {
        clickedElement.addClass(classes);
        selected = true;
    }

    //parentElement.find('div[a-option]').removeClass(classes);

    let value = clickedElement.attr('a-option');
    return { value, selected, element };
}

function clearButtons(element) {
    let parentElement = jQuery(element).parent().closest('div[a-options]');
    let classes = parentElement.attr('a-option-selected-classes');
    parentElement.find('div[a-option]').removeClass(classes);
}

function htmlDecode(input) {
    var doc = new DOMParser().parseFromString(input, "text/html");
    return doc.documentElement.textContent;
}

function ifNotAnimating(callback) {
    if (anime.running == 0) {
        callback();
    };
}

function cancelAnimations() {
    const runningAnims = anime.running; 
    while (runningAnims.length > 0) { 
        runningAnims.pop(); 
    }
}

function initFontAutofill() {
    jQuery(".a-font-autofill").fitText();
}

function initResponsive() {
    const r = document.querySelector(':root');
    const w = jQuery(document).width();

    if (w > 2000) {
        r.style.setProperty('--main-horizontal-margin', '10vw');
        r.style.setProperty('--main-vertical-margin', '5vh');
    } else if (w > 599) {
        r.style.setProperty('--main-horizontal-margin', '6vw');
        r.style.setProperty('--main-vertical-margin', '3vh');
    } else {
        r.style.setProperty('--main-horizontal-margin', '4vw');
        r.style.setProperty('--main-vertical-margin', '2vh');
    }

    initFontAutofill();
}

let scrolled_element = false;

jQuery('img').on("load", () => {
    if(scrolled_element) {
        auditori_scrollTo(scrolled_element);
    }
    
});

async function auditori_scrollTo(element) {
    if(!element) return;
    scrolled_element = element;

    user_scrolled = false;

    const header_height = jQuery('#a-main-header')?.outerHeight();
    const header_items = jQuery('#a-secondary-header');

    let minus_header = 0;
    if (header_items.length > 0) {
        minus_header = header_items.outerHeight();
    }

    const elementOffset = jQuery(element)[0].getBoundingClientRect().top;
    const scrollPosition = window.scrollY;

    const documentTop = document.documentElement.clientTop;
    const scrollOffset = elementOffset + scrollPosition - documentTop - minus_header - header_height;

    cancelAnimations();
    await anime({
        targets: [document.documentElement, document.body],
        scrollTop: scrollOffset,
        duration: 800,
        easing: 'easeInOutQuad'
    }).finished;

    await later(3000);
    scrolled_element = false;
}

jQuery(window).resize(initResponsive);
jQuery(window).on("auditori-init", initResponsive);

let initCounter = 0;

function throwEvent() {
    initCounter++;
    if (initCounter == 2) {
        jQuery(document).trigger("auditori-ready");
        jQuery(document).trigger("auditori-init");
    }
}

function onReady() {
    if (typeof less !== 'undefined') {
        less.pageLoadFinished.then(throwEvent);
    } else {
        throwEvent();
    }
}

function compare_post_dates(a, b) {
    if (a.wp_post.post_date < b.wp_post.post_date) {
        return 1;
    }
    if (a.wp_post.post_date > b.wp_post.post_date) {
        return -1;
    }
    return 0;
}

onReady();

function buildHtmlTable(selector, list) {
    jQuery(selector).empty();

    var columns = addAllColumnHeaders(selector, list);

    for (var i = 0; i < list.length; i++) {
        var row$ = jQuery('<tr/>');
        for (var colIndex = 0; colIndex < columns.length; colIndex++) {
            var cellValue = list[i][columns[colIndex]];

            if (cellValue == null) { cellValue = ""; }

            row$.append(jQuery('<td/>').html(cellValue));
        }
        jQuery(selector).append(row$);
    }
}


// Adds a header row to the table and returns the set of columns.
// Need to do union of keys from all records as some records may not contain
// all records
function addAllColumnHeaders(selector, list) {
    var columnSet = [];
    var headerTr$ = jQuery('<tr/>');

    for (var i = 0; i < list.length; i++) {
        var rowHash = list[i];
        for (var key in rowHash) {
            if (jQuery.inArray(key, columnSet) == -1) {
                columnSet.push(key);
                headerTr$.append(jQuery('<th/>').html(key));
            }
        }
    }

    jQuery(selector).append(headerTr$);

    return columnSet;
}

jQuery.moveColumn = function(table, from, to) {
    var rows = jQuery('tr', table);
    var cols;
    rows.each(function() {
        cols = jQuery(this).children('th, td');
        cols.eq(from).detach().insertBefore(cols.eq(to));
    });
}

if (document.readyState !== 'loading') {
    throwEvent();
} else {
    document.addEventListener('DOMContentLoaded', function() {
        throwEvent();
    });
}