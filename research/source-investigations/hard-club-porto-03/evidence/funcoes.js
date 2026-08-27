var scrolltopvalue=50;
var link_back="";
var titulo_back="";
var current="";
$(document).ready(function() {
	
	if (!checkCookieExists('cookie_accept')) {
		$("#cookie_msg").show();
	}
	$("#cookie_accept").click(function(e) {
		e.preventDefault();
		$("#cookie_msg").fadeOut(300);
		$.cookie("cookie_accept", "true", {
			expires: new Date(2030, 12, 31, 23, 59, 59),
			path: '/'
		});
	});
	
	$(".goTop").click(function(e){
		e.preventDefault();
		var p=$('html');
	    var offsetHeight=0;
	    $(window).stop();
	    //jQuery.scrollTo.window().queue([]).stop(); // Prevent scroll queue from building up
		jQuery(window).scrollTo(p, {duration:400, easing:'swing', offset:offsetHeight, axis:'y' }, {queue:false});
	});
	
	$(".menu_open").click(function(e){
		e.preventDefault();
		if($(this).hasClass("open"))
		{
			menuClose();
		}
		else
		{
			menuOpen();
		}
	});
	
	$(".more").click(function(e){
		e.preventDefault();
		$(".submenu").fadeToggle(300);
		$(".more").find("img").toggleClass('flip');
	})
	
	$("#bt_contactos").click(function(e){
		e.preventDefault();
		menuClose();
		scrollToElement($("#g"+$(this).attr("data-rel")),0);
	});
	
	$("#bt_bilheteira").click(function(e){
		e.preventDefault();
		menuClose();
		scrollToElement($("#g"+$(this).attr("data-rel")),0);
	});
	
	$("#bt_newsletter").click(function(e){
		e.preventDefault();
		menuClose();
		scrollToElement($("#g"+$(this).attr("data-rel")),0);
	});
	
	$(".equipamento_link").click(function(e){
		e.preventDefault();
		
		if(!$(this).hasClass("open"))
		{
			openAuditorio($(this).attr("id"));
		}
		else{
			closeAuditorio($(this).attr("id"));
		}
	});
	
	$(".close").click(function(e){
		e.preventDefault();
		closeAuditorio($(this).attr("data-rel"));
	});
	
	$(".bt_alugueres").click(function(e){
		e.preventDefault();
		
		if(!$(this).hasClass("open"))
		{
			openAluguer($(this).attr("id"));
		}
		else{
			closeAluguer($(this).attr("id"));
		}
	});
	
	$(document).scroll(function() {
	  var y = $(this).scrollTop();
	  if (y > 300) {
	    $('.goTop').fadeIn();
	  } else {
	    $('.goTop').fadeOut();
	  }
	});
});

$(window).bind("load", function() {
	$(".loader").fadeOut(300);
});

$(window).bind('resize', function() {
	
});

function openAluguer(elm)
{
	$elm=$("#"+elm);
/*
	$(".filtro_item").removeClass("black");
	$(".bt_alugar").removeClass("open");
*/
	$elm.find(".filtro_item").addClass("black");
	$elm.addClass("open");
	$elm.parent().find(".alugar_info").slideDown(200);
}

function closeAluguer(elm)
{
	$elm=$("#"+elm);
	$elm.find(".filtro_item").removeClass("black");
	$elm.removeClass("open");
	$elm.parent().find(".alugar_info").slideUp(200);
}

function openAuditorio(elm)
{
	$elm=$("#"+elm);
	$(".equipamento_link").removeClass("open");
	$elm.addClass("open");
	setTitleLink($elm.attr("data-alt")+" - "+site_titulo,$elm.attr("href"));
	$elm.parent().parent().find(".full_info").fadeIn(250);
	
	$elm.parent().parent().parent().parent().find(".img_back").css("background-size",$(window).width()).css("background-position","top center");
	$elm.parent().find(".plantas_link").fadeIn(250);
}

function closeAuditorio(elm)
{
	$elm=$("#"+elm);
	$elm.parent().find(".plantas_link").fadeOut(250);
	$(".equipamento_link").removeClass("open");
	setTitleLink($("#titulo_antigo").val()+" - "+site_titulo,$("#link_antigo").val());
	$elm.parent().parent().find(".full_info").fadeOut(200,function(){
		$elm.parent().parent().parent().parent().find(".img_back").css("background-size",'cover').css("background-position","top center");
	});
}

function scrollToElement(elm,offSet)
{
	var p=$(elm);
    var offsetHeight=offSet;
    $(window).stop();
    //jQuery.scrollTo.window().queue([]).stop(); // Prevent scroll queue from building up
	jQuery(window).scrollTo(p, {duration:800, easing:'swing', offset:offsetHeight, axis:'y' }, {queue:false});
}

function menuOpen()
{
	$("#menu_wrap").stop(true,true).fadeIn(200);
	pauseScroll();
	$(".menu_open").addClass('open');
}

function menuClose()
{
	playScroll();
	$(".menu_open").removeClass("open");
	$("#menu_wrap").stop(true,true).fadeOut(200);
}

function pauseScroll()
{
	 // get body width now

    var body_width = $("body").width();
    // set overflow hidden on body. this will prevent it scrolling
    $("body").css("overflow", "hidden"); 
    // get new body width. no scrollbar now, so it will be bigger
    var new_body_width = $("body").width();
    // set the difference between new width and old width as padding to prevent jumps                                     
    $("body").css("padding-right", (new_body_width-body_width)+"px");

}

function playScroll()
{
	$("body").css("overflow", "auto").css("padding-right","0px");
}


function resetCookies() {
	if (typeof $.cookie('cookie_accept') != 'undefined') $.removeCookie("cookie_accept");
}

function checkCookieExists(cookie) {
	if (typeof $.cookie(cookie) === 'undefined') return false;
	else return true;
}

function getContent(action,start,passo,lang,event)
{
/*	y="";
	s="";

	if($("#s_y").val()!="")
		y=$("#s_y").val();
	
	if($("#s_s").val()!="")
		s=$("#s_s").val();
*/
	$.get("/include/ajax_functions.php",{'action': action,'start':start,'rand':Math.random(),'langid':lang,'passo':passo,'evento':event},function(data)
	{
		wait=false;
		if(data)
        {
            $("#postswrapper .item").append(data);
            $('div#loadmoreajaxloader').hide();
            
            if(action=="load-arquivo" || action=="load-agenda")
			{
				setColumn(".col"+start);
			}
        }
        else
        {
            $('div#loadmoreajaxloader').hide();
            continue_load=false;
        }			
	});
}

function doScroll(action,lang,event)
{
	var doscroll=true;
	if(valid)
	{
		if($("#postswrapper").is(":visible"))
		{
			doscroll=true;
		}
		else
		{
			doscroll=false;
		}
	}
	
	if(doscroll)
	{
		if((($(window).scrollTop() + $("header").height()) > $(document).height() - $(window).height() - $("footer").height()) && continue_load )
	    {
	        $('div#loadmoreajaxloader').show();
	        if(!wait)
	        {
		        wait=true;
		        delay(function(){
					getContent(action,$("#postswrapper a.post_rel:last").attr("data-rel"),passo,lang);
				},500);
			}
	    }
	}
}

function doScrollIsotope(action,container,lang)
{
	$("."+container).isotope('layout');
	if((($(window).scrollTop() + $("header").height()) > $(document).height() - $(window).height() - $("footer").height()) && continue_load )
    {
	    $('div#loadmoreajaxloader').show();
        if(!wait)
        {
	        wait=true;
	        delay(function(){
				getContentIsotope(action, $("#postswrapper a.post_rel:last").attr("data-rel"),passo,container,lang);
			},500);
		}
    }
}

function getContentIsotope(action,start,passo,container,lang)
{
	$.get("/include/ajax_functions.php",{'action':action,'start':start,'rand':Math.random(),'langid':lang,'passo':passo},function(data)
	{
		wait=false;
		if(data)
        {
            elem=$(data);
            $('.'+container).append( elem ).isotope( 'appended', elem ).isotope('layout');
			$('div#loadmoreajaxloader').hide();
	    }
        else
        {
            $('div#loadmoreajaxloader').hide();
            continue_load=false;
        }			
	});
}

function callEvento(id,content,langid,act,index)
{

	$.get("/include/ajax_functions.php",{'action':'loadevent','langid':langid,'id':id,'type':act,'index':index},function(data)
	{
		if(data)
        {
           content.html(data);
        }
    });
    
/*
    var
	History = window.History,
	State = History.getState();
	
	if("pushState" in History)
	{
		History.pushState(null, $("#"+id).attr("alt")+" - "+site_titulo , $("#"+id).attr("href"));
    }
*/
}

function goToEventDirect(event,action,lang)
{
	scrollToElement("#"+event,$("#resposicao_evento_link").height());
	$content=$("#"+event).parent().nextAll(".content:first");
	
	//$(".img").css("top","0").removeClass("sel");
	$(".img").removeClass("sel");
	//$("#<?php echo $event?>").find(".img").css("top","80px").addClass("sel");
	$("#"+event).find(".img").addClass("sel");
	index=$("#"+event).attr("data-index");
	if($content.is(":visible"))
	{
		callEvento("#"+event,$content,lang,action,index);
	}
	else
	{
		callEvento("#"+event,$content,lang,action,index);
		$content.fadeIn(200);
	}	
}

function close(elm)
{
	$content=elm.parent().parent().html('').fadeOut(200);
	$(".items .img").css("top","0");
	setTitleLink($("#titulo_antigo").val(),$("#link_antigo").val());
}

function setTitleLink(title,link)
{
	var
	History = window.History, // Note: We are using a capital H instead of a lower h
	State = History.getState();
	
	if("pushState" in History)
	{
		History.pushState(null, title, link);
    }
}

function adjustAbout()
{
	if($(window).width()<768)
	{
		$(".filto_back_preto").height($("header").innerHeight()+$(".resumo").innerHeight()+ $(".label-menu-titulo").innerHeight() + 100);
	}
	else{
		$(".filto_back_preto").height("");
	}
}

function setColumn(start)
{
	$num=$("#num_linha").val();
	i=0;
	$("ul.item .items"+start+"").each(function(){
		if(i%$num==($num-1))
			$(this).after('<li class="content"></li>');
		i++;
	});
	
	//se fez load de menos de máximo da linha acrescenta na mesma
	//if(i<($num-1))
	if(!$('ul.item li:last').hasClass('content'))
		$("ul.item").append('<li class="content"></li>');
		
	$j=1;
	
	$("ul.item .items:not(.content)").each(function(){
		$(this).find("a.post_rel").attr("data-index",$j);
		$j++;
		if($j>$num)
			$j=1;
	});
}

function defineNumLinhas()
{
	if($(window).width()<768){
		$("#num_linha").val("1");
	}
	else{
		$("#num_linha").val("3");
	}
}

$.extend({
	getUrlVars: function() {
		var vars = [],
			hash;
		var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
		for (var i = 0; i < hashes.length; i++) {
			hash = hashes[i].split('=');
			vars.push(hash[0]);
			vars[hash[0]] = hash[1];
		}
		return vars;
	},
	getUrlVar: function(name) {
		return $.getUrlVars()[name];
	}
});

function isTouchDevice() {
	return typeof window.ontouchstart !== 'undefined';
}

var browser;
jQuery.uaMatch = function(ua) {
	ua = ua.toLowerCase();
	var match = /(chrome)[ \/]([\w.]+)/.exec(ua) || /(webkit)[ \/]([\w.]+)/.exec(ua) || /(opera)(?:.*version|)[ \/]([\w.]+)/.exec(ua) || /(msie) ([\w.]+)/.exec(ua) || ua.indexOf("compatible") < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec(ua) || [];
	return {
		browser: match[1] || "",
		version: match[2] || "0"
	};
};
if (!jQuery.browser) {
	matched = jQuery.uaMatch(navigator.userAgent);
	browser = {};
	if (matched.browser) {
		browser[matched.browser] = true;
		browser.version = matched.version;
	}
	if (browser.chrome) {
		browser.webkit = true;
	} else if (browser.webkit) {
		browser.safari = true;
	}
	jQuery.browser = browser;
}

var delay = (function(){
  var timer = 0;
  return function(callback, ms){
	clearTimeout (timer);
	timer = setTimeout(callback, ms);
  };
})();