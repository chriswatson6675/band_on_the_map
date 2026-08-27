$(document).ready(function () {
  $(".swiper-slide > p > iframe, .swiper-slide > p > iframe").wrap(
    '<div class="player" />'
  );

  $(document).bind("keyup", function (evt) {
    if ($("input").is(":focus")) {
      return false;
    }
    if (evt.keyCode == 191) {
      $("#skip-to-content").focus();
    }

    if (evt.keyCode == 82) {
      $("#footer .social-networks li:first-child a").focus();
    }

    if (evt.keyCode == 70) {
      $("#footer").focus();
    }

    if ($("#search-category").length) {
      if (evt.keyCode == 67) {
        if ($(document).scrollTop() > 100) {
          $(".cloned-filters select#search-category").focus();
        } else {
          $("select#search-category").focus();
        }
      }
    }
  });

  if ($(".programme").length) {
    var waypoints = $(".trigger-season-name").waypoint({
      handler: function (direction) {
        $(".contextual-info .title").text($(this.element).attr("data-trigger"));
      },
    });
  }

  if ($(".has-read-more").length) {
    $(".has-read-more").each(function () {
      var container = $(this);
      var hr = container.find("hr");

      if (hr.length) {
        var elements_after = hr.nextAll();
        var extra_text = $("<div class='extra-text'></div>");
        elements_after.wrap(extra_text);

        hr.remove();

        var read_more = $(
          "<a href='#' class='read-more' title='' aria-expanded='false'>" +
            saoluiz.read_more +
            "</a>"
        );
        container.append(read_more);

        read_more.click(function () {
          var elem = $(this);

          if (elem.siblings(".extra-text").hasClass("expanded")) {
            elem.siblings(".extra-text").removeClass("expanded");
            elem.attr("aria-expanded", "false");
            elem.empty().text(saoluiz.read_more);
          } else {
            elem.siblings(".extra-text").addClass("expanded");
            elem.attr("aria-expanded", "true");
            elem.empty().text(saoluiz.read_less);
          }

          return false;
        });
      }
    });
  }

  var gallery = $(".show-image-in-lightbox").simpleLightbox({
    animationSlide: false,
    animationSpeed: 0,
    history: false,
  });

  if ($("html").attr("lang") == "en-US") {
    var prevSlideMessageLang = "Previous slide",
      nextSlideMessageLang = "Next slide",
      firstSlideMessageLang = "This is the first slide",
      lastSlideMessageLang = "This is the last slide",
      paginationBulletMessageLang = "Go to slide {{index}}",
      currentSlideMessageLang = "(current slide)";
  } else if ($("html").attr("lang") == "fr-FR") {
    var prevSlideMessageLang = "Diapositive précédente",
      nextSlideMessageLang = "Diapositive suivante",
      firstSlideMessageLang = "Ceci est la première diapositive",
      lastSlideMessageLang = "Ceci est la dernière diapositive",
      paginationBulletMessageLang = "Aller à la diapositive {{index}}",
      currentSlideMessageLang = "(diapositive en cours)";
  } else {
    var prevSlideMessageLang = "Slide anterior",
      nextSlideMessageLang = "Próximo slide",
      firstSlideMessageLang = "Este é o primeiro slide",
      lastSlideMessageLang = "Esté é o último slide",
      paginationBulletMessageLang = "Ir para o slide {{index}}",
      currentSlideMessageLang = "(slide atual)";
  }

  get_calendar();
  // console.log("Document ready, loading initial calendar");
  $("span.nav-item").on("keyup", function (e) {
    if (e.keyCode === 13) {
      // Trigger the button element with a click
      $(this).trigger("click");
    }
    e.preventDefault();
  });

  var dropdown_is_opened = false;

  if ($(".homepage").length) {
    var $header = $("#header");

    var scroll = $(window).scrollTop();
    if (scroll >= 200) {
      $header.addClass("white-bg");
    } else {
      $header.removeClass("white-bg");
    }

    $(window).scroll(function () {
      if (dropdown_is_opened == false) {
        var scroll = $(window).scrollTop();
        if (scroll >= 200) {
          $header.addClass("white-bg");
        } else {
          $header.removeClass("white-bg");
        }
      }
    });

    $(".calendar-toggle").click(function () {
      //$header.addClass("white-bg");
      var scroll = $(window).scrollTop();
      //console.log(dropdown_is_opened);
      if ($("body").hasClass("calendar-is-visible") && scroll <= 200) {
        $header.removeClass("white-bg");
      } else {
        $header.addClass("white-bg");
        //console.log("b");
      }
    });

    $(".dropdown").on("show.bs.dropdown", function () {
      //console.log("a");
      $header.addClass("white-bg");
      dropdown_is_opened = true;
    });

    $(".dropdown").on("hide.bs.dropdown", function () {
      var scroll = $(window).scrollTop();
      //console.log("b");
      if (scroll <= 200 && !$("body").hasClass("calendar-is-visible")) {
        $header.removeClass("white-bg");
      }
      dropdown_is_opened = false;
    });
  }

  $(document).on("click", ".dropdown-menu", function (e) {
    e.stopPropagation();
  });

  $(".dropdown-toggle").click(function () {
    if ($("body").hasClass("calendar-is-visible")) {
      $(".close-calendar").trigger("click");
    }
  });

  $(".menu-toggle").click(function () {
    $(this).toggleClass("opened");
    if ($(".homepage").length && !$("#header").hasClass("white-bg")) {
      $("#header").toggleClass("white-bg");
    }
    $("body").toggleClass("overflow");
  });

  if ($(".homepage").length) {
    var num_slides = $(".swiper-hero .swiper-slide").length;

    var loop_setting = true;

    if (num_slides == 1) {
      var loop_setting = false;
    }

    var swiper_hero = new Swiper(".swiper-hero", {
      speed: 500,
      effect: "slide",
      lazy: {
        loadPrevNext: true,
        loadPrevNextAmount: num_slides,
      },
      loop: loop_setting,
      autoplay: false,
      pagination: {
        el: ".swiper-hero-pagination",
        type: "bullets",
        clickable: true,
      },
      navigation: {
        nextEl: ".hero-controls .swiper-button-next",
        prevEl: ".hero-controls .swiper-button-prev",
      },
      a11y: {
        prevSlideMessage: prevSlideMessageLang,
        nextSlideMessage: nextSlideMessageLang,
        firstSlideMessage: firstSlideMessageLang,
        lastSlideMessage: lastSlideMessageLang,
        paginationBulletMessage: paginationBulletMessageLang,
      },
      on: {
        slideChangeTransitionEnd: function ($this) {
          $(".swiper-hero-pagination .swiper-pagination-bullet").each(
            function (index, elem) {
              var bullet = $(elem);
              var ariaLabel = bullet.attr("aria-label");

              if (bullet.hasClass("swiper-pagination-bullet-active")) {
                bullet.attr(
                  "aria-label",
                  ariaLabel + " " + currentSlideMessageLang
                );
              } else {
                bullet.attr(
                  "aria-label",
                  ariaLabel.replace(currentSlideMessageLang, "")
                );
              }
            }
          );
        },
      },
    });

    $(window).on("load", function () {
      if (loop_setting == true) {
        swiper_hero.params.autoplay.delay = 4000;
        swiper_hero.autoplay.start();
      }
    });
  }

  var swiper = new Swiper(".swiper-news", {
    slidesPerView: "auto",
    navigation: {
      nextEl: ".news-events .swiper-button-next",
      prevEl: ".news-events .swiper-button-prev",
    },
    pagination: {
      el: ".swiper-pagination-news",
      type: "bullets",
      clickable: true,
    },
    a11y: {
      prevSlideMessage: prevSlideMessageLang,
      nextSlideMessage: nextSlideMessageLang,
      firstSlideMessage: firstSlideMessageLang,
      lastSlideMessage: lastSlideMessageLang,
      paginationBulletMessage: paginationBulletMessageLang,
    },
    on: {
      slideChangeTransitionEnd: function ($this) {
        $(".swiper-pagination-news .swiper-pagination-bullet").each(
          function (index, elem) {
            var bullet = $(elem);
            var ariaLabel = bullet.attr("aria-label");

            if (bullet.hasClass("swiper-pagination-bullet-active")) {
              bullet.attr(
                "aria-label",
                ariaLabel + " " + currentSlideMessageLang
              );
            } else {
              bullet.attr(
                "aria-label",
                ariaLabel.replace(currentSlideMessageLang, "")
              );
            }
          }
        );
      },
    },
  });

  var num_slides = $(".swiper-general .swiper-slide").length;

  var swiper = new Swiper(".swiper-general", {
    slidesPerView: "auto",
    lazy: {
      loadPrevNext: true,
      loadPrevNextAmount: num_slides,
    },
    navigation: {
      nextEl: ".swiper-nav-general .swiper-button-next",
      prevEl: ".swiper-nav-general .swiper-button-prev",
    },
    pagination: {
      el: ".swiper-pagination-general",
      type: "bullets",
      clickable: true,
    },
    a11y: {
      prevSlideMessage: prevSlideMessageLang,
      nextSlideMessage: nextSlideMessageLang,
      firstSlideMessage: firstSlideMessageLang,
      lastSlideMessage: lastSlideMessageLang,
      paginationBulletMessage: paginationBulletMessageLang,
    },
    on: {
      slideChangeTransitionEnd: function ($this) {
        $(".swiper-pagination-general .swiper-pagination-bullet").each(
          function (index, elem) {
            var bullet = $(elem);
            var ariaLabel = bullet.attr("aria-label");

            if (bullet.hasClass("swiper-pagination-bullet-active")) {
              bullet.attr(
                "aria-label",
                ariaLabel + " " + currentSlideMessageLang
              );
            } else {
              bullet.attr(
                "aria-label",
                ariaLabel.replace(currentSlideMessageLang, "")
              );
            }
          }
        );
      },
    },
  });

  var $result_container = $(".events-list"),
    $search_season_form = $("#search-season-form"),
    $search_category = $("#search-category"),
    $search_season = $("#search-season"),
    $search_keyword = $("#search-keyword"),
    current_year_value = $search_category.attr("data-current-year"),
    is_single_filter = false;
  is_media = false;

  if ($search_season_form.hasClass("single-filter")) {
    is_single_filter = true;
  } else if (
    $search_season_form.hasClass("media") ||
    $search_category.hasClass("media") ||
    $search_keyword.hasClass("media")
  ) {
    is_media = true;
  }

  if ($search_season_form.length) {
    $search_season_form.on("submit", function (e) {
      $result_container.addClass("is-loading");

      var season_value = $search_season.val(),
        category_value = $search_category.val(),
        searched_keyword_value = $search_keyword.val();

      $("html,body").scrollToGlobal("body");
      if (is_single_filter == true) {
        get_events(current_year_value, category_value);
        var new_url = "?categoria=" + category_value;
      } else if (is_media == true) {
        get_media_archive_events(
          season_value,
          category_value,
          searched_keyword_value
        );
        var new_url =
          "?categoria=" +
          category_value +
          "&temp=" +
          season_value +
          "&search=" +
          searched_keyword_value;
      } else {
        get_archive_events(
          season_value,
          category_value,
          searched_keyword_value
        );
        var new_url =
          "?categoria=" +
          category_value +
          "&temp=" +
          season_value +
          "&search=" +
          searched_keyword_value;
      }

      window.history.pushState(new_url, "", new_url);
      e.preventDefault();
    });

    $(window).on("popstate", function () {
      var category_param = get_url_param("categoria", ""),
        season_param = get_url_param("temp", ""),
        search_param = get_url_param("search", "");

      if (season_param == "") {
        season_param = $("#search-season option:first").val();
      }

      $search_category.val(category_param);
      $search_season.val(season_param);
      $search_keyword.val(search_param);

      if (is_single_filter == true) {
        get_events(current_year_value, category_param);
        var new_url = "?categoria=" + category_value;
      } else {
        get_archive_events(season_param, category_param, search_param);
        var new_url =
          "?categoria=" +
          category_param +
          "&temp=" +
          season_param +
          "&search=" +
          search_param;
      }
    });

    $(document).on("change", ".form-filter", function () {
      ($filter_name = $(this).attr("name")),
        $(".cloned-filters .form-filter[name='" + $filter_name + "']").val(
          $(this).val()
        );
      $search_season_form.submit();
    });
  }

  $(".show-items-toggle").click(function (e) {
    e.preventDefault();
    var $this = $(this);
    $this.attr("aria-expanded", "true").hide();
    $this.parent().next(".card-deck").attr("aria-hidden", "false");
    $this.closest(".show-max-items").addClass("all-visible");
  });

  if ($(".show-max-items").length) {
    check_show_max_items();

    $(window).on("resizeend", function (e) {
      check_show_max_items();
    });
  }

  if ($(".swiper-gallery").length) {
    create_galleries();

    if (window.matchMedia("(max-width: 767px)").matches) {
      current_resolution = "mobile";
    } else {
      current_resolution = "desktop";
    }

    $(window).on("resizeend load", function (e) {
      // Mobile
      if (window.matchMedia("(max-width: 767px)").matches) {
        if (current_resolution == "desktop") {
          for (var i = 0; i < gallery_slideshows.length; i++) {
            gallery_slideshows[i].destroy(true, true);
          }

          create_galleries();
        }
        current_resolution == "mobile";

        // Desktop
      } else {
        //console.log("b");
        if (current_resolution == "mobile") {
          //console.log("b1");
          for (var i = 0; i < gallery_slideshows.length; i++) {
            gallery_slideshows[i].destroy(true, true);
          }

          current_resolution == "desktop";
          create_galleries();
        } else {
          var window_width = $(window).width(),
            offset_before = window_width / 4 + 7.5;

          for (var i = 0; i < gallery_slideshows.length; i++) {
            var $last_slide = $(".swiper-gallery")
                .eq(i)
                .find(".swiper-slide:last-child"),
              last_slide_width = $(".swiper-gallery")
                .eq(i)
                .find(".swiper-slide:last-child")
                .width(),
              offset_after =
                (window_width / 4) * 2 - last_slide_width + offset_before - 30;

            gallery_slideshows[i].params.slidesOffsetBefore = offset_before;
            $last_slide.css("padding-right", offset_after + "px");
            gallery_slideshows[i].update();
          }
        }
      }
    });
  }

  $(".search-toggle").click(function () {
    setTimeout(function () {
      $("form.search input[name='s']").focus();
    }, 200);
  });

  if ($(".alert-message").length) {
    var alert_message_cookie = Cookies.get("closed-message");
    if (!alert_message_cookie) {
      $(".alert-message").addClass("is-visible");
      $(".close-alert").click(function () {
        $(".alert-message").removeClass("is-visible");
        Cookies.set("closed-message", "true", { expires: 7 });
      });
    }
  }

  var $main = $("#main"),
    $contextual_info = $(".contextual-info");

  if ($contextual_info.length) {
    var scroll = $(window).scrollTop();
    if (scroll >= 400) {
      $contextual_info.addClass("is-visible");
    } else {
      $contextual_info.removeClass("is-visible");
    }
    $(window).scroll(function () {
      var scroll = $(window).scrollTop();
      if (scroll >= 400) {
        $contextual_info.addClass("is-visible");
      } else {
        $contextual_info.removeClass("is-visible");
      }
    });

    var $filters = $("#search-season-form").clone();
    $filters.attr("id", "");

    $filters.find("select").each(function () {
      $(this).on("change", function () {
        var $this = $(this),
          $filter_name = $this.attr("name"),
          $selected_value = $this.val();

        $(".root-filters .form-filter[name='" + $filter_name + "']").val(
          $selected_value
        );
      });
    });

    $filters.on("submit", function (e) {
      var $written_term = $(".cloned-filters").find(".search-events").val();
      $(".root-filters .search-events").val($written_term);
      $("#search-season-form").submit();
      e.preventDefault();
    });

    if ($main.hasClass("programme")) {
      $(".cloned-filters").html($filters);
    }

    $(document).on("keyup", ".search-events", function () {
      $(".search-events").not(this).val($(this).val());
    });
  }
});

$(window).on("load", function () {
  lazy_load_images();
  $(".lazy-srcset").each(function () {
    var $t = $(this);
    $t.attr({
      srcset: $t.attr("data-srcset"),
    }).removeAttr("data-srcset");
  });

  $(".lazy-iframe").each(function () {
    var $t = $(this);
    $t.attr({
      src: $t.attr("data-src"),
    }).removeAttr("data-src");
  });
});

function get_media_archive_events(temporada, categoria, pesquisa) {
  $.ajax({
    type: "GET",
    url: saoluiz.adminAjax,
    data: {
      action: "CCAjax",
      request: "get_media",
      temp: temporada,
      categoria: categoria,
      search: pesquisa,
    },
    success: function (result) {
      $("#response").html(result);
      lazy_load_images();
      $(".events-list").removeClass("is-loading");
      setTimeout(function () {
        $(".card-deck .event-item:first a").focus();
      }, 500);

      galite("set", "page", location.pathname + location.search);
      galite("send", "pageview");
    },
  });
}

function get_archive_events(temporada, categoria, pesquisa) {
  $.ajax({
    type: "GET",
    url: saoluiz.adminAjax,
    data: {
      action: "CCAjax",
      request: "get_espetaculos",
      temp: temporada,
      categoria: categoria,
      search: pesquisa,
    },
    success: function (result) {
      $("#response").html(result);
      lazy_load_images();
      $(".events-list").removeClass("is-loading");
      setTimeout(function () {
        $(".card-deck .event-item:first a").focus();
      }, 500);

      galite("set", "page", location.pathname + location.search);
      galite("send", "pageview");
    },
  });
}

function get_events(temporada, categoria) {
  $.ajax({
    type: "GET",
    url: saoluiz.adminAjax,
    data: {
      action: "CCAjax",
      request: "get_programacao",
      temporada: temporada,
      categoria: categoria,
    },
    success: function (result) {
      $("#response").html(result);
      lazy_load_images();
      $(".events-list").removeClass("is-loading");
      setTimeout(function () {
        $(".card-deck .event-item:first a").focus();
      }, 500);
      //gtag('config', 'UA-125543505-1', {'page_path': location.pathname+location.search});
      galite("set", "page", location.pathname + location.search);
      galite("send", "pageview");
    },
  });
}

function get_calendar(selectedSeason, selectedMonth) {
  var temporada = selectedSeason || $("#calendar").attr("data-season");
  var month = selectedMonth || new Date().toISOString().slice(0, 7);
  var lang = $("#calendar").attr("data-season-lang");
  // console.log("Getting calendar for season:", temporada);

  $.ajax({
    url: saoluiz.adminAjax,
    data: {
      action: "CCAjax",
      request: "get_calendario",
      temporada: temporada,
      month: month,
      lang: lang,
    },
    success: function (result) {
      // console.log("AJAX success");
      $("#calendar").html(result);
      try {
        // console.log("try AJAX success");
      } catch (e) {
        console.error("Error parsing events data:", e);
        return;
      }

      create_calendar(result, month);

      $(".calendar-toggle").click(function (e) {
        if (
          $(window).width() <= 574 &&
          $("body").hasClass("homepage") &&
          !$(".calendar-content").hasClass("expand")
        ) {
          $(".calendar-content").addClass("expand");
        }
        if ($("body").hasClass("calendar-is-visible")) {
          $(".close-calendar").trigger("click");
        } else {
          $(".calendar-content").fadeIn(150);
          $("body").addClass("overflow calendar-is-visible");
          // calendar_swiper.update();
        }
        e.preventDefault();
      });

      $(".close-calendar").click(function () {
        $(".calendar-content").fadeOut(150);
        $("body").removeClass("overflow calendar-is-visible");
      });

      $(".select-season select").on("change", function () {
        // console.log("Season selector changed");
        var selectedSeason = $(this).val();
        // console.log("Season changed to:", selectedSeason);

        var currentMonth = $(".select-month select").val().split("-")[1];
        updateMonthSelector(selectedSeason);

        var selectedMonth = `${selectedSeason.split("-")[1]}-${currentMonth}`;
        if (currentMonth >= 8 && currentMonth <= 12) {
          selectedMonth = `${selectedSeason.split("-")[0]}-${currentMonth}`;
        } else {
          selectedMonth = `${selectedSeason.split("-")[1]}-${currentMonth}`;
        }

        // console.log("Selected month:", selectedMonth);

        $(".select-month select").val(selectedMonth);
        get_calendar(selectedSeason, selectedMonth);
      });

      $(".select-month select").on("change", function () {
        var selectedMonth = $(this).val();
        // var selectedMonth = $(this).val();
        // console.log("Month changed to:", selectedMonth);
        var selectedSeason = $(".select-season select").val();
        get_calendar(selectedSeason, selectedMonth);
      });
    },
    error: function (jqXHR, textStatus, errorThrown) {
      console.error("AJAX error:", textStatus, errorThrown);
    },
  });
}

function updateMonthSelector(selectedSeason) {
  var currentYear = new Date().getFullYear();
  var currentMonth = new Date().getMonth() + 1;
  var seasonStartYear = parseInt(selectedSeason.split("-")[0]);
  var seasonEndYear = parseInt(selectedSeason.split("-")[1]);

  var monthOptions = ['<option value="" selected="selected"></option>'];
  if (currentMonth <= 12) {
    for (var i = currentMonth; i <= 12; i++) {
      var month = i < 10 ? "0" + i : i;
      monthOptions.push(
        `<option value="${seasonStartYear}-${month}"></option>`
      );
    }
  }
  if (currentMonth > 1) {
    for (var i = 1; i < currentMonth; i++) {
      var month = i < 10 ? "0" + i : i;
      monthOptions.push(`<option value="${seasonEndYear}-${month}"></option>`);
    }
  }

  $(".select-month select").html(monthOptions.join(""));
  $(".select-month select").val("");
}

function create_calendar(events, newdate) {
  var d = new Date(),
    dia = d.getDate(),
    mes = d.getMonth() + 1,
    ano = d.getFullYear();

  dia = dia < 10 ? "0" + dia : dia;
  mes = mes < 10 ? "0" + mes : mes;

  var date = newdate || `${ano}-${mes}-${dia}`;

  if ($(".daySlider").length === 0) {
    console.error("daySlider element not found");
    return;
  }

  var [selectedYear, selectedMonth] = date.split("-");
  var daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  var daysList = "";
  var eventDays = $(".show-days")
    .text()
    .split(",")
    .map((day) => day.trim());
  $(".show-days").remove();

  for (var i = 1; i <= daysInMonth; i++) {
    var dayOfWeek = new Date(selectedYear, selectedMonth - 1, i).getDay();
    var isEventDay = eventDays.includes(i.toString());
    var eventClass = isEventDay ? "event" : "";
    daysList += `<div class="day ${eventClass} calendar-day-${i}-${selectedMonth}-${selectedYear} calendar-dow-${dayOfWeek}"><div class="day-contents"><small></small><span class="span-day">${i}</span> </div></div>`;
  }
  $(".daySlider").html(`${daysList}`);

  $(".day.event").on("click", function () {
    var classes = $(this).attr("class").split(/\s+/);
    var targetClass = classes
      .find((cls) => cls.startsWith("calendar-day-"))
      .replace("calendar-day-", "filter-date-");
    var $target = $("." + targetClass);

    if ($target.length) {
      var offset = $(window).width() <= 991.98 ? 56 : 81;
      $("#calendar").animate(
        {
          scrollTop:
            $target.offset().top -
            $("#calendar").offset().top +
            $("#calendar").scrollTop() -
            offset,
        },
        500
      );
    }
  });

  var calendar_swiper = new Swiper(".swiper-container-calendar", {
    freeMode: true,
    slidesPerView: "auto",
    spaceBetween: 0,
    mousewheel: true,
    speed: 50,
    grabCursor: true,
  });

  $(".calendar-toggle")
    .off("click")
    .on("click", function (e) {
      if (
        $(window).width() <= 574 &&
        $("body").hasClass("homepage") &&
        !$(".calendar-content").hasClass("expand")
      ) {
        $(".calendar-content").addClass("expand");
      }
      $(".calendar-content").fadeIn(150, function () {
        calendar_swiper.update();
      });
      e.preventDefault();
    });

  $(".close-calendar")
    .off("click")
    .on("click", function () {
      $(".calendar-content").fadeOut(150);
      $("body").removeClass("overflow calendar-is-visible");
    });

  $(".select-month select")
    .off("change")
    .on("change", function () {
      var selectedValue = $(this).val();
      $(".calendar-content").scrollTop(0);
      var newdate = selectedValue;
      $(".select-month select").val(newdate);
      create_calendar(events, newdate);
    });
}

function create_galleries() {
  if ($("html").attr("lang") == "en-US") {
    var prevSlideMessageLang = "Previous slide",
      nextSlideMessageLang = "Next slide",
      firstSlideMessageLang = "This is the first slide",
      lastSlideMessageLang = "This is the last slide",
      paginationBulletMessageLang = "Go to slide {{index}}",
      currentSlideMessageLang = "(current slide)";
  } else if ($("html").attr("lang") == "fr-FR") {
    var prevSlideMessageLang = "Diapositive précédente",
      nextSlideMessageLang = "Diapositive suivante",
      firstSlideMessageLang = "Ceci est la première diapositive",
      lastSlideMessageLang = "Ceci est la dernière diapositive",
      paginationBulletMessageLang = "Aller à la diapositive {{index}}",
      currentSlideMessageLang = "(diapositive en cours)";
  } else {
    var prevSlideMessageLang = "Slide anterior",
      nextSlideMessageLang = "Próximo slide",
      firstSlideMessageLang = "Este é o primeiro slide",
      lastSlideMessageLang = "Esté é o último slide",
      paginationBulletMessageLang = "Ir para o slide {{index}}",
      currentSlideMessageLang = "(slide atual)";
  }

  gallery_slideshows = [];

  var window_width = $(window).width();

  $(".swiper-gallery").each(function (index) {
    var $this = $(this),
      $next_btn = $(".swiper-button-next", $this),
      $prev_btn = $(".swiper-button-prev", $this),
      $pagination = $(".swiper-pagination-gallery", $this),
      $current_slide_fraction = $(this).find(".current-slide");

    if (window.matchMedia("(max-width: 767px)").matches) {
      var offset_before = 0,
        offset_after = 0,
        auto_height_setting = true;
    } else {
      var $last_slide = $(".swiper-slide:last-child", $this),
        last_slide_width = $last_slide.width(),
        offset_before = window_width / 4 + 7.5,
        offset_after =
          (window_width / 4) * 2 - last_slide_width + offset_before - 30,
        auto_height_setting = false;
      $last_slide.css("padding-right", offset_after + "px");
    }

    var gallery_swiper = new Swiper($this, {
      slidesPerView: "auto",
      slidesOffsetBefore: offset_before,
      slideToClickedSlide: true,
      autoHeight: auto_height_setting,
      pagination: {
        el: ".swiper-pagination-gallery",
        type: "bullets",
        clickable: true,
      },
      navigation: {
        nextEl: $next_btn,
        prevEl: $prev_btn,
      },
      a11y: {
        prevSlideMessage: prevSlideMessageLang,
        nextSlideMessage: nextSlideMessageLang,
        firstSlideMessage: firstSlideMessageLang,
        lastSlideMessage: lastSlideMessageLang,
        paginationBulletMessage: paginationBulletMessageLang,
      },
      on: {
        slideChange: function () {
          $current_slide_fraction.text(
            gallery_slideshows[index].activeIndex + 1
          );
        },
        slideChangeTransitionEnd: function ($this) {
          $(".swiper-pagination-gallery .swiper-pagination-bullet").each(
            function (index, elem) {
              var bullet = $(elem);
              var ariaLabel = bullet.attr("aria-label");

              if (bullet.hasClass("swiper-pagination-bullet-active")) {
                bullet.attr(
                  "aria-label",
                  ariaLabel + " " + currentSlideMessageLang
                );
              } else {
                bullet.attr(
                  "aria-label",
                  ariaLabel.replace(currentSlideMessageLang, "")
                );
              }
            }
          );
        },
      },
    });
    gallery_slideshows.push(gallery_swiper);
    console.log(gallery_slideshows);
  });
}

function check_show_max_items() {
  $(".card-deck").each(function () {
    var $this = $(this),
      count_hidden_children = $(this).children(":hidden").length;
    if (count_hidden_children == 0) {
      $this.prev(".max-items-toggle-container").addClass("sr-only");
    } else {
      $this.prev(".max-items-toggle-container").removeClass("sr-only");
    }
  });
}

function updateVisibleEvents() {
  console.log("Updating visible events");

  // Debug: Log all select elements
  console.log("All select elements:", $("select").length);
  console.log("Visible select elements:", $("select:visible").length);

  var $visibleSelect = $(".select-month select:visible");
  var $hiddenSelect = $(".select-month select:hidden");

  console.log("Visible month select found:", $visibleSelect.length);
  console.log("Hidden month select found:", $hiddenSelect.length);

  if ($visibleSelect.length === 0 && $hiddenSelect.length === 0) {
    console.error("No month select found at all");
    // Attempt to find any select element as a fallback
    $visibleSelect = $("select:visible").first();
    console.log("Fallback to any visible select:", $visibleSelect.length);
  }

  var selected_value = $visibleSelect.val() || $hiddenSelect.val();
  console.log("Selected month value:", selected_value);

  if (selected_value) {
    if ($hiddenSelect.length > 0) {
      $hiddenSelect.val(selected_value);
    }

    var current_month = selected_value.split("-");
    console.log("Current month:", current_month);

    $(".calendar-month-container").removeClass("is-visible");
    var $visibleContainer = $(
      ".calendar-month-container.filter-date-" +
        current_month[1] +
        "-" +
        current_month[0]
    );
    $visibleContainer.addClass("is-visible");

    console.log("Visible container found:", $visibleContainer.length);

    var num_visible_events = $(".calendar-month-container.is-visible").length;
    console.log("Number of visible events:", num_visible_events);

    $(".empty-message").toggleClass("is-visible", num_visible_events === 0);
  } else {
    console.error("No month selected");
    // Show all events as a fallback
    $(".calendar-month-container").addClass("is-visible");
    $(".empty-message").removeClass("is-visible");
  }
}

jQuery.fn.scrollTo = function (elem, speed) {
  $(this).animate(
    {
      scrollTop:
        $(this).scrollTop() -
        $(this).offset().top +
        $(elem).parent().parent().offset().top -
        $(".calendar-row-wrapper").height(),
    },
    speed == undefined ? 300 : speed
  );
  return this;
};

jQuery.fn.scrollToGlobal = function (elem, speed) {
  $("body,html").animate(
    {
      scrollTop: $(elem).position().top - 19,
    },
    speed == undefined ? 300 : speed
  );
  return this;
};

function lazy_load_images() {
  // $('.lazy').each(function(){
  // 	$(this).attr("src",$(this).attr("data-src"));
  // })
  $(".lazy").Lazy();
}

function get_url_vars() {
  var vars = {};
  var parts = window.location.href.replace(
    /[?&]+([^=&]+)=([^&]*)/gi,
    function (m, key, value) {
      vars[key] = value;
    }
  );
  return vars;
}

function get_url_param(parameter, defaultvalue) {
  var urlparameter = defaultvalue;
  if (window.location.href.indexOf(parameter) > -1) {
    urlparameter = get_url_vars()[parameter];
  }
  return urlparameter;
}
