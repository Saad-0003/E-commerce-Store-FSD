/* =====================================================================
   alto. store  |  all interaction handled with jQuery
   Part 1  Store UI: preview, customization, cart, drag and drop, order
   Part 2  Premium: lock, payment popup with live card, unlock
   Part 3  Public API (AJAX GET) and our Express/MySQL backend (AJAX GET + POST)
   ===================================================================== */
$(function () {
  // ---------- Settings ----------
  const BACKEND_URL = "http://localhost:3000"; // Express server
  const PUBLIC_API_URL = "https://dummyjson.com/products"; // public product API
  const THEMES = {
    midnight: { name: "Midnight Black", premium: false },
    ocean: { name: "Ocean Blue", premium: false },
    forest: { name: "Forest Green", premium: false },
    sunset: { name: "Sunset Orange", premium: false },
    gold: { name: "Royal Gold", premium: true },
    rose: { name: "Rose Blush", premium: true },
    titanium: { name: "Titanium Silver", premium: true },
  };
  const SIZES = {
    500: { label: "500 ml", price: 29, scale: 0.85 },
    750: { label: "750 ml", price: 34, scale: 1 },
    1000: { label: "1 L", price: 39, scale: 1.12 },
  };
  const STYLE_NAMES = { standard: "Standard", script: "Script", mono: "Monogram" };
  const PREMIUM_SURCHARGE = 5;
  const DEFAULT_ENGRAVING = "Your text";
  const MAX_CHARS = 20;
  const HERO_COLOURS = [
    { body: "#111111", shade: "#000000", text: "#ffffff" },
    { body: "#006837", shade: "#004d28", text: "#ffffff" },
    { body: "#1f6fe0", shade: "#1553ab", text: "#ffffff" },
    { body: "#c9a227", shade: "#9c7c1c", text: "#ffffff" },
    { body: "#ffffff", shade: "#c9c9c2", text: "#111111" },
  ];

  // ---------- Elements used many times ----------
  const $previewCard = $("#previewCard");
  const $bottle = $("#bottle");
  const $stateBadge = $("#stateBadge");
  const $dropMessage = $("#dropMessage");
  const $overlay = $("#paymentOverlay");

  // ---------- App state ----------
  let cartItems = [];
  let isPremium = false;
  let isProcessingPayment = false;
  let heroColorIndex = 0;

  // ---------- Helpers ----------
  function money(amount) { return "$" + Number(amount).toFixed(2); }

  function setFieldMessage($el, text, type) {
    $el.text(text).attr("class", "field-message " + (type || ""));
  }

  // Validate one input: marks it valid/invalid and shows a message
  function check($input, $msg, valid, message) {
    $input.toggleClass("valid", valid).toggleClass("invalid", !valid);
    setFieldMessage($msg, valid ? "" : message, valid ? "" : "error");
    return valid;
  }

  function showResult(text, type, withLottie) {
    $("#formResultText").text(text);
    $("#formResult").attr("class", "result show " + type);
    $("#orderLottie").toggleClass("show", !!withLottie);
    if (withLottie) playLottie($("#orderLottiePlayer")[0]);
  }

  function playLottie(player) {
    try {
      if (player && typeof player.seek === "function") { player.stop(); player.seek(0); player.play(); }
    } catch (e) { /* animation library unavailable: the static check mark stays */ }
  }

  function getTheme() {
    const premiumFinish = $('input[name="pfinish"]:checked').val();
    return premiumFinish !== "none" ? premiumFinish : $("#themeSelect").val();
  }
  function getSize() { return SIZES[$('input[name="variant"]:checked').val()] || SIZES[750]; }
  function getUnitPrice() { return getSize().price + (THEMES[getTheme()].premium ? PREMIUM_SURCHARGE : 0); }

  function applyPreview() {
    $previewCard.attr("data-theme", getTheme());
    $stateBadge.text(THEMES[getTheme()].name);
    $("#productPrice").text(money(getUnitPrice()));
  }
  function applyBottleScale() {
    $bottle.data("scale", getSize().scale).css("transform", "scale(" + getSize().scale + ")");
  }
  function applyEngravingStyle() {
    const style = $("#engStyle").val();
    $("#engravingPreview").toggleClass("eng-script", style === "script").toggleClass("eng-mono", style === "mono");
  }

  // ======================= PART 1: STORE UI =======================

  // ---- Cart (bottles and API add-ons share one list) ----
  function renderCart() {
    const $list = $("#cartList").empty();
    let total = 0;
    $.each(cartItems, function (index, item) {
      total += item.price;
      const $row = $("<li>").append(
        $("<div>").append($("<span>").text(item.title), $("<small>").text(item.detail)),
        $("<div>").append(
          $("<span>").addClass("cart-item-price").text(money(item.price)), " ",
          $("<button>").attr("type", "button").addClass("cart-remove").text("Remove").on("click", function () {
            cartItems.splice(index, 1);
            renderCart();
            $dropMessage.removeClass("success").text(cartItems.length ? "Item removed. Drop another bottle here" : "Drop the bottle here");
          })
        )
      );
      $list.append($row);
    });
    $("#cartCount").text(cartItems.length);
    $("#cartTotal").text(money(total));
  }

  function bumpCart() {
    $("#cartBadge").removeClass("pop").width(); // .width() forces a reflow so the animation restarts
    $("#cartBadge").addClass("pop");
  }

  function addCurrentConfigToCart() {
    const themeKey = getTheme();
    if (THEMES[themeKey].premium && !isPremium) { // safety net
      showResult("That finish is Premium. Upgrade to unlock it.", "error");
      openPayment();
      return;
    }
    cartItems.push({
      type: "bottle",
      productId: 1,
      title: "Alto Insulated Bottle",
      detail: THEMES[themeKey].name + " · " + getSize().label + ' · "' +
        ($.trim($("#engravingInput").val()) || "No engraving") + '" · ' + STYLE_NAMES[$("#engStyle").val()],
      price: getUnitPrice(),
      color: themeKey,
      variant: Number($('input[name="variant"]:checked').val()),
      engraving: $.trim($("#engravingInput").val()),
      engravingStyle: $("#engStyle").val(),
      shine: $("#shineToggle").is(":checked"),
      isPremium: isPremium,
    });
    renderCart(); bumpCart();
    $dropMessage.text("Added to cart: " + THEMES[themeKey].name).addClass("success");
  }

  // ---- Copy / cut protection ----
  let noticeTimer;
  $("#productDescription").on("copy cut contextmenu", function (event) {
    event.preventDefault();
    $("#copyNotice").text("Copying or cutting the product description is disabled.");
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () { $("#copyNotice").text(""); }, 3000);
  });

  // ---- Customization controls ----
  $("#themeSelect").on("change", function () {
    $('input[name="pfinish"][value="none"]').prop("checked", true); // free finish clears premium swatch
    applyPreview();
  });
  $('input[name="variant"]').on("change", function () { applyBottleScale(); applyPreview(); });
  $('input[name="pfinish"]').on("change", function () {
    if (!isPremium && $(this).val() !== "none") {
      $('input[name="pfinish"][value="none"]').prop("checked", true);
      openPayment();
      return;
    }
    applyPreview();
  });
  $("#engStyle").on("change", function () {
    if (!isPremium && $(this).val() !== "standard") { $(this).val("standard"); openPayment(); return; }
    applyEngravingStyle();
  });
  $("#shineToggle").on("change", function () {
    if (!isPremium) { $(this).prop("checked", false); openPayment(); return; }
    $("#bottleBody").toggleClass("shine", this.checked);
  });

  // ---- Live engraving + character limit ----
  $("#engravingInput").on("input", function () {
    const length = $(this).val().length;
    $("#engravingPreview").text($(this).val() || DEFAULT_ENGRAVING);
    $("#engravingCounter").text(length + " / " + MAX_CHARS);
    if (length >= MAX_CHARS) setFieldMessage($("#engravingMessage"), "Character limit reached.", "error");
    else if (length >= MAX_CHARS - 5) setFieldMessage($("#engravingMessage"), MAX_CHARS - length + " characters left.", "warning");
    else setFieldMessage($("#engravingMessage"), "Up to 20 characters.", "");
  });
  // Quick engraving ideas
  $(".eng-chips").on("click", ".chip", function () {
    $("#engravingInput").val($(this).data("text")).trigger("input").trigger("focus");
  });

  // ---- Checkout field validation (focus / blur) ----
  function validateName() {
    const v = $.trim($("#customerName").val());
    return check($("#customerName"), $("#nameMessage"), v.length >= 2 && !/\d/.test(v), "Please enter your full name.");
  }
  function validateEmail() {
    return check($("#customerEmail"), $("#emailMessage"), /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($.trim($("#customerEmail").val())), "Enter a valid email address.");
  }
  function validateCustomer() {
    const nameOk = validateName();
    const emailOk = validateEmail();
    if (!nameOk) $("#customerName").trigger("focus");
    else if (!emailOk) $("#customerEmail").trigger("focus");
    return nameOk && emailOk;
  }
  $("#customerName, #customerEmail")
    .on("focus", function () { $(this).removeClass("invalid"); })
    .on("blur", function () { this.id === "customerName" ? validateName() : validateEmail(); });

  // ---- Interactive preview: mousemove / mouseenter / mouseleave ----
  $previewCard.on("mousemove", function (event) {
    const box = this.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    $("#previewGlow").css({ "--x": x + "px", "--y": y + "px" });
    const tiltY = (x / box.width - 0.5) * 20;
    const tiltX = (y / box.height - 0.5) * -12;
    $bottle.css("transform", "perspective(600px) rotateY(" + tiltY + "deg) rotateX(" + tiltX + "deg) scale(" + ($bottle.data("scale") || 1) + ")");
  }).on("mouseenter", function () {
    $previewCard.addClass("hovered"); $stateBadge.text("Inspecting");
  }).on("mouseleave", function () {
    $previewCard.removeClass("hovered"); applyBottleScale(); $stateBadge.text(THEMES[getTheme()].name);
  });

  // ---- Drag and drop ----
  $previewCard.on("dragstart", function (event) {
    event.originalEvent.dataTransfer.setData("text/plain", "alto-bottle");
    event.originalEvent.dataTransfer.effectAllowed = "copy";
    $previewCard.addClass("dragging"); $stateBadge.text("Dragging...");
  }).on("dragend", function () {
    $previewCard.removeClass("dragging"); $stateBadge.text(THEMES[getTheme()].name);
  });

  $("#dropZone").on("dragenter", function (event) {
    event.preventDefault();
    $(this).addClass("drag-over");
    $dropMessage.removeClass("success").text("Release to add to cart");
  }).on("dragover", function (event) {
    event.preventDefault(); // required to allow dropping
  }).on("dragleave", function (event) {
    if (!this.contains(event.originalEvent.relatedTarget)) {
      $(this).removeClass("drag-over");
      $dropMessage.text(cartItems.length ? "Drop another bottle here" : "Drop the bottle here");
    }
  }).on("drop", function (event) {
    event.preventDefault();
    $(this).removeClass("drag-over");
    addCurrentConfigToCart();
    showResult("Added to cart. Fill in your details to place the order.", "info");
  });

  $("#addToCartButton").on("click", function () { addCurrentConfigToCart(); showResult("Added to cart.", "info"); });
  $("#cartBadge").on("click", function () { $("#custom")[0].scrollIntoView({ behavior: "smooth" }); });

  // ---- Place order (submit) ----
  $("#configForm").on("submit", function (event) {
    event.preventDefault();
    if (!validateCustomer()) return showResult("Please fix the highlighted fields before ordering.", "error");
    if (cartItems.length === 0) return showResult("Your cart is empty. Drag the bottle into the cart or click Add to cart.", "error");

    const url = BACKEND_URL + "/api/orders";
    const order = {
      customerName: $.trim($("#customerName").val()),
      customerEmail: $.trim($("#customerEmail").val()),
      items: cartItems,
    };
    send($("#placeOrderButton"), "Placing order...", {
      url: url,
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify(order),
      dataType: "json",
      timeout: 10000,
      success: function (response) {
        showResult(
          "Thanks, " + order.customerName + "! Order #" + response.order.id + " for " +
            money(response.order.total) + " has been saved.",
          "success", true
        );
        cartItems = []; renderCart();
        $dropMessage.removeClass("success").text("Drop the bottle here");
        $("#loadOrders").trigger("click");
      },
      error: function (jqXHR, textStatus) {
        showResult(errorText(jqXHR, textStatus, "the backend"), "error");
      },
    });
  });

  // ---- Reset ----
  $("#configForm").on("reset", function () {
    setTimeout(function () { // the browser clears the inputs first
      $('input[name="pfinish"][value="none"]').prop("checked", true);
      $("#shineToggle").prop("checked", false);
      $("#bottleBody").removeClass("shine");
      $("#engravingPreview").text(DEFAULT_ENGRAVING).removeClass("eng-script eng-mono");
      $("#engravingCounter").text("0 / " + MAX_CHARS);
      setFieldMessage($("#engravingMessage"), "Up to 20 characters.", "");
      setFieldMessage($("#nameMessage"), ""); setFieldMessage($("#emailMessage"), "");
      $("#customerName, #customerEmail").removeClass("valid invalid");
      applyBottleScale(); applyPreview();
      $stateBadge.text("Hover to explore");
      cartItems = []; renderCart();
      $dropMessage.removeClass("success").text("Drop the bottle here");
      showResult("Configurator has been reset.", "info"); // Premium stays active after a reset
    }, 0);
  });

  // ---- Scroll: progress bar, header shadow, section reveal ----
  $(window).on("scroll", function () {
    const scrollable = $(document).height() - $(window).height();
    $("#scrollProgress").css("width", (scrollable > 0 ? ($(window).scrollTop() / scrollable) * 100 : 0) + "%");
    $("#siteHeader").toggleClass("scrolled", $(window).scrollTop() > 10);
    $(".reveal").each(function () {
      if (this.getBoundingClientRect().top < window.innerHeight * 0.88) $(this).addClass("in");
    });
  });

  // ---- Hero SVG: click / Enter cycles colours ----
  function cycleHeroColour() {
    heroColorIndex = (heroColorIndex + 1) % HERO_COLOURS.length;
    const colour = HERO_COLOURS[heroColorIndex];
    $("#hbBody").attr("fill", colour.body);
    $("#hbShade").attr("fill", colour.shade);
    $("#heroBottle text").attr("fill", colour.text);
  }
  $("#heroBottle").on("click", cycleHeroColour).on("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); cycleHeroColour(); }
  });

  // ---- Video advertisement ----
  function showVideoFallback() {
    $("#adVideo").hide(); $("#videoFallback").prop("hidden", false); $("#videoStatus").text("Video unavailable");
  }
  $("#adVideo").on("play", function () { $("#videoStatus").text("Now playing"); })
    .on("pause", function () { $("#videoStatus").text("Paused"); })
    .on("ended", function () { $("#videoStatus").text("Thanks for watching"); })
    .on("error", showVideoFallback);
  $("#adVideo source").on("error", showVideoFallback); // <source> errors do not bubble

  // ======================= PART 2: PREMIUM =======================
  $("#premiumLock, #upgradeButton").on("click", function () { openPayment(); });

  function showPayView(view) {
    $("#payViewForm").prop("hidden", view !== "form");
    $("#payViewProcessing").prop("hidden", view !== "processing");
    $("#payViewSuccess").prop("hidden", view !== "success");
  }

  function openPayment() {
    if (isPremium) {
      $("#paySuccessTitle").text("You are already Premium");
      showPayView("success");
    } else {
      showPayView("form");
    }
    $("body").css("overflow", "hidden"); // page does not scroll behind the popup
    $overlay.prop("hidden", false);
    requestAnimationFrame(function () { // next frame so the opening transition runs
      $overlay.addClass("open");
      if (!isPremium) $("#cardName").trigger("focus");
    });
  }

  function closePayment() {
    if (isProcessingPayment) return; // never close mid-payment
    $overlay.removeClass("open");
    $("body").css("overflow", "");
    setTimeout(function () { $overlay.prop("hidden", true); }, 250);
  }

  $("#closePayment").on("click", closePayment);
  $overlay.on("click", function (event) { if (event.target === this) closePayment(); });
  $(document).on("keydown", function (event) { if (event.key === "Escape" && !$overlay.prop("hidden")) closePayment(); });

  // ---- Live card: what the user types is "engraved" on the card ----
  function updateCard() {
    const digits = $("#cardNumber").val().replace(/\D/g, "");
    const shown = (digits + "\u2022".repeat(16)).slice(0, 16).replace(/(.{4})(?=.)/g, "$1 ");
    $("#ccNumber").text(shown);
    $("#ccName").text($.trim($("#cardName").val()).toUpperCase() || "YOUR NAME");
    $("#ccExpiry").text($("#cardExpiry").val() || "MM/YY");
    $("#ccCvv").text($("#cardCvv").val().replace(/./g, "\u2022") || "\u2022\u2022\u2022");
    $("#ccBrand").text(/^4/.test(digits) ? "VISA" : /^(5[1-5]|2[2-7])/.test(digits) ? "MASTERCARD" : "alto+");
    $("#creditCard").removeClass("typing").width(); $("#creditCard").addClass("typing");
  }

  $("#cardNumber").on("input", function () {
    const digits = $(this).val().replace(/\D/g, "").slice(0, 16);
    $(this).val(digits.replace(/(\d{4})(?=\d)/g, "$1 ")).removeClass("invalid");
    updateCard();
  });
  $("#cardExpiry").on("input", function () {
    let digits = $(this).val().replace(/\D/g, "").slice(0, 4);
    if (digits.length === 1 && digits > "1") digits = "0" + digits; // typing 5 gives 05
    if (digits.length >= 3) digits = digits.slice(0, 2) + "/" + digits.slice(2);
    $(this).val(digits).removeClass("invalid");
    updateCard();
  });
  $("#cardCvv").on("input", function () {
    $(this).val($(this).val().replace(/\D/g, "").slice(0, 4)).removeClass("invalid");
    updateCard();
  }).on("focus", function () { $("#creditCard").addClass("flipped"); // show the back of the card
  }).on("blur", function () { $("#creditCard").removeClass("flipped"); });
  $("#cardName").on("input", function () {
    $(this).val($(this).val().replace(/[^A-Za-z .'-]/g, "")).removeClass("invalid"); // letters only
    updateCard();
  });

  // ---- Payment validation ----
  function validateCardName() {
    const v = $.trim($("#cardName").val());
    return check($("#cardName"), $("#cardNameMessage"), v.length >= 2, "Enter the name on the card.");
  }
  function validateCardNumber() {
    return check($("#cardNumber"), $("#cardNumberMessage"), $("#cardNumber").val().replace(/\D/g, "").length === 16, "Card number must be 16 digits.");
  }
  function validateCardExpiry() {
    const value = $("#cardExpiry").val();
    let valid = /^\d{2}\/\d{2}$/.test(value);
    if (valid) {
      const month = parseInt(value.slice(0, 2), 10);
      const year = 2000 + parseInt(value.slice(3, 5), 10);
      const now = new Date();
      valid = month >= 1 && month <= 12 && (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1));
    }
    return check($("#cardExpiry"), $("#cardExpiryMessage"), valid, "Enter a valid future date (MM/YY).");
  }
  function validateCardCvv() {
    return check($("#cardCvv"), $("#cardCvvMessage"), /^\d{3,4}$/.test($("#cardCvv").val()), "CVV must be 3 or 4 digits.");
  }
  $("#cardName").on("blur", validateCardName);
  $("#cardNumber").on("blur", validateCardNumber);
  $("#cardExpiry").on("blur", validateCardExpiry);
  $("#cardCvv").on("blur", validateCardCvv);

  function clearPaymentForm() {
    $("#paymentForm")[0].reset();
    $("#paymentForm input").removeClass("valid invalid");
    $("#paymentForm .field-message").text("");
    updateCard();
  }

  // Test card so the demo is quick (fake number, never real data)
  $("#fillTestCard").on("click", function () {
    const year = String((new Date().getFullYear() + 3) % 100).padStart(2, "0");
    $("#cardName").val("Saad Ali"); $("#cardNumber").val("4242 4242 4242 4242");
    $("#cardExpiry").val("12/" + year); $("#cardCvv").val("123");
    updateCard();
    $("#paymentForm input").removeClass("invalid");
  });

  // ---- Simulated payment (submit) ----
  $("#paymentForm").on("submit", function (event) {
    event.preventDefault();
    if (isProcessingPayment) return;
    const results = [validateCardName(), validateCardNumber(), validateCardExpiry(), validateCardCvv()];
    if (results.indexOf(false) !== -1) {
      $("#paymentForm input").eq(results.indexOf(false)).trigger("focus");
      return;
    }
    isProcessingPayment = true;
    $("#payButton").prop("disabled", true);
    showPayView("processing");
    setTimeout(function () {
      isProcessingPayment = false;
      $("#payButton").prop("disabled", false);
      clearPaymentForm(); // card details never stay in the page
      $("#paySuccessTitle").text("You are Premium now!");
      showPayView("success");
      playLottie($("#paySuccessPlayer")[0]);
      activatePremium();
    }, 2200);
  });

  function activatePremium() {
    if (isPremium) return;
    isPremium = true;
    $("#statusPill").text("Premium User").addClass("premium");
    $("#premiumBlock").removeClass("premium-locked");
    $("#upgradeButton").text("Premium active").prop("disabled", true);
    showResult("alto+ Premium unlocked - premium finishes, styles and shine are now available.", "info");
  }

  $("#payDone").on("click", function () { closePayment(); $("#custom")[0].scrollIntoView({ behavior: "smooth" }); });

  // ---- Lottie fallback when the library is blocked or offline ----
  $(window).on("load", function () {
    setTimeout(function () {
      $("lottie-player").each(function () {
        if (typeof this.play !== "function") {
          $(this).hide().parent().find(".lottie-fallback").addClass("show");
        }
      });
    }, 3000);
  });

  // ======================= PART 3: API AND BACKEND =======================

  // Capture actual request and response data from every jQuery AJAX call.
  const requestLogEntries = [];
  const requestLogByXhr = new WeakMap();
  const MAX_LOG_ENTRIES = 8;

  function formatLogValue(value) {
    if (typeof value === "string") return value;
    return JSON.stringify(value, null, 2);
  }

  function renderRequestLog() {
    if (!requestLogEntries.length) {
      $("#apiLog").text("API requests and responses will appear here.");
      return;
    }
    $("#apiLog").text(requestLogEntries.map(function (entry) {
      return "[" + entry.time + "] " + entry.method + " " + entry.url +
        "\nStatus: " + entry.status +
        "\nRequest:\n" + formatLogValue(entry.request) +
        "\nResponse:\n" + formatLogValue(entry.response) + "\n";
    }).join("\n"));
  }

  function parseRequestData(settings) {
    if (!settings.data) return settings.type === "GET" ? "No request body (GET)" : "No request body";
    if (typeof settings.data !== "string") return settings.data;
    try {
      return JSON.parse(settings.data);
    } catch (error) {
      return settings.data;
    }
  }

  function getResponseData(jqXHR) {
    if (jqXHR.responseJSON !== undefined) return jqXHR.responseJSON;
    if (!jqXHR.responseText) return null;
    try {
      return JSON.parse(jqXHR.responseText);
    } catch (error) {
      return jqXHR.responseText;
    }
  }

  $(document).on("ajaxSend", function (event, jqXHR, settings) {
    const entry = {
      time: new Date().toLocaleTimeString(),
      method: (settings.type || "GET").toUpperCase(),
      url: settings.url,
      status: "Pending",
      request: parseRequestData(settings),
      response: "Waiting for response...",
    };
    requestLogByXhr.set(jqXHR, entry);
    requestLogEntries.unshift(entry);
    if (requestLogEntries.length > MAX_LOG_ENTRIES) requestLogEntries.pop();
    renderRequestLog();
  }).on("ajaxComplete", function (event, jqXHR) {
    const entry = requestLogByXhr.get(jqXHR);
    if (!entry) return;
    entry.status = jqXHR.status
      ? jqXHR.status + (jqXHR.statusText ? " " + jqXHR.statusText : "")
      : "Failed: " + (jqXHR.statusText || "Network error");
    entry.response = getResponseData(jqXHR);
    renderRequestLog();
  });
  renderRequestLog();

  function setMsg($el, text, type) { $el.text(text).removeClass("ok err").addClass(type || ""); }

  function errorText(jqXHR, textStatus, where) {
    if (jqXHR.responseJSON && jqXHR.responseJSON.error) return jqXHR.responseJSON.error;
    if (textStatus === "timeout") return where + " took too long to answer.";
    if (jqXHR.status === 0) return "Could not reach " + where + ". Check your connection.";
    return where + " returned an error (" + jqXHR.status + ").";
  }

  // Runs an AJAX call and keeps its button disabled while waiting
  function send($button, busyLabel, options) {
    const label = $button.text();
    if ($button.prop("disabled")) return;
    $button.prop("disabled", true).text(busyLabel);
    return $.ajax(options).always(function () { $button.prop("disabled", false).text(label); });
  }

  // ---- Server status chip (GET /api/health) ----
  function checkServer() {
    $.ajax({ url: BACKEND_URL + "/api/health", method: "GET", dataType: "json", timeout: 4000 })
      .done(function (r) {
        $("#serverStatus").attr("class", "server-chip online").text("Server online \u00b7 storage: " + (r.storage === "mysql" ? "MySQL (XAMPP)" : "memory (start MySQL)"));
      })
      .fail(function () {
        $("#serverStatus").attr("class", "server-chip offline").text("Server offline \u00b7 run: node server.js");
      });
  }

  // ---- Q2: public API, AJAX GET (with search) ----
  $("#apiForm").on("submit", function (event) {
    event.preventDefault();
    const query = $.trim($("#apiQuery").val());
    const $msg = $("#apiMsg");
    setMsg($msg, "Loading products...", "");
    send($("#loadApiProducts"), "Loading...", {
      url: query ? PUBLIC_API_URL + "/search" : PUBLIC_API_URL,
      method: "GET",
      data: query ? { q: query, limit: 6 } : { limit: 6 },
      dataType: "json",
      timeout: 10000,
      success: function (response) {
        const products = response.products || [];
        const $grid = $("#apiProducts").empty();
        if (!products.length) return setMsg($msg, 'No products found for "' + query + '".', "err");
        $.each(products, function (i, product) {
          const $card = $("<div>").addClass("api-card");
          if (product.thumbnail) {
            $("<img>").attr({ src: product.thumbnail, alt: product.title, loading: "lazy" })
              .on("error", function () { $(this).hide(); }).appendTo($card);
          }
          $("<h4>").text(product.title).appendTo($card); // .text() keeps API data from running as HTML
          $("<p>").addClass("api-cat").text(product.category).appendTo($card);
          $("<p>").addClass("api-price").text(money(product.price)).appendTo($card);
          $("<button>").attr("type", "button").addClass("btn btn-secondary").text("Add to cart").on("click", function () {
            cartItems.push({ title: product.title, detail: "Add-on \u00b7 " + product.category, price: Number(product.price) });
            renderCart(); bumpCart();
            $dropMessage.text("Added to cart: " + product.title).addClass("success");
          }).appendTo($card);
          $grid.append($card);
        });
        setMsg($msg, products.length + " product(s) loaded from DummyJSON.", "ok");
      },
      error: function (jqXHR, textStatus) {
        setMsg($msg, errorText(jqXHR, textStatus, "the public API"), "err");
      },
    });
  });
  $("#clearApiProducts").on("click", function () {
    $("#apiProducts").empty(); $("#apiQuery").val(""); setMsg($("#apiMsg"), "", "");
  });

  // ---- Q3: Express backend, AJAX GET /api/products ----
  $("#loadCatalog").on("click", function () {
    const url = BACKEND_URL + "/api/products";
    const $msg = $("#catalogMsg");
    setMsg($msg, "Loading catalog...", "");
    send($(this), "Loading...", {
      url: url, method: "GET", dataType: "json", timeout: 8000,
      success: function (response) {
        const $list = $("#catalogList").empty();
        $.each(response.products, function (i, p) {
          $list.append($("<li>").append(
            $("<div>").text(p.name).append($("<small>").text(p.category + ". " + p.description)),
            $("<strong>").text(money(p.price))
          ));
        });
        setMsg($msg, response.count + " products loaded from " + (response.storage === "mysql" ? "MySQL" : "memory") + ".", "ok");
      },
      error: function (jqXHR, textStatus) {
        setMsg($msg, errorText(jqXHR, textStatus, "the backend") + " Start it with: node server.js", "err");
      },
    });
  });

  // ---- Q3: Express backend, AJAX GET /api/configurations (rows from MySQL) ----
  $("#loadSaved").on("click", function () {
    const url = BACKEND_URL + "/api/configurations";
    send($(this), "Loading...", {
      url: url, method: "GET", dataType: "json", timeout: 8000,
      success: function (response) {
        const $list = $("#catalogList").empty();
        $.each(response.configurations, function (i, config) {
          $list.append($("<li>").append(
            $("<div>").text(config.product_name + " · " + config.color + " · " + config.variant + " ml")
              .append($("<small>").text('"' + config.engraving + '" · ' + config.engraving_style +
                (config.customer_name ? " · Saved for " + config.customer_name : ""))),
            $("<strong>").text(money(config.price))
          ));
        });
        if (!response.count) $list.append($("<li>").text("No saved designs yet."));
        setMsg($("#catalogMsg"), response.count + " saved design(s) loaded from " + (response.storage === "mysql" ? "MySQL" : "memory") + ".", "ok");
      },
      error: function (jqXHR, textStatus) {
        setMsg($("#catalogMsg"), errorText(jqXHR, textStatus, "the backend"), "err");
      },
    });
  });

  // ---- Q3: Express backend, AJAX GET /api/orders ----
  $("#loadOrders").on("click", function () {
    const url = BACKEND_URL + "/api/orders";
    send($(this), "Loading...", {
      url: url, method: "GET", dataType: "json", timeout: 8000,
      success: function (response) {
        const $list = $("#catalogList").empty();
        $.each(response.orders, function (i, order) {
          $list.append($("<li>").append(
            $("<div>").text("Order #" + order.id + " · " + order.status)
              .append($("<small>").text(new Date(order.created_at).toLocaleString())),
            $("<strong>").text(money(order.total_amount || order.total))
          ));
        });
        if (!response.count) $list.append($("<li>").text("No orders have been placed yet."));
        setMsg($("#catalogMsg"), response.count + " recent order(s) loaded from " + (response.storage === "mysql" ? "MySQL" : "memory") + ".", "ok");
      },
      error: function (jqXHR, textStatus) {
        setMsg($("#catalogMsg"), errorText(jqXHR, textStatus, "the backend"), "err");
      },
    });
  });

  // ---- Q3: Express backend, AJAX POST /api/configurations ----
  $("#saveDesignButton").on("click", function () {
    if (!validateCustomer()) {
      setMsg($("#configMsg"), "Add a valid name and email above before saving your design.", "err");
      return;
    }
    const url = BACKEND_URL + "/api/configurations";
    const $msg = $("#configMsg");
    const config = { // JavaScript object, read with jQuery
      color: getTheme(),
      variant: $('input[name="variant"]:checked').val(),
      engraving: $.trim($("#engravingInput").val()),
      engravingStyle: $("#engStyle").val(),
      shine: $("#shineToggle").is(":checked"),
      isPremium: isPremium,
      customerName: $.trim($("#customerName").val()),
      customerEmail: $.trim($("#customerEmail").val()),
    };
    setMsg($msg, "Sending...", "");
    send($(this), "Saving...", {
      url: url,
      method: "POST",
      contentType: "application/json", // tells Express the body is JSON
      data: JSON.stringify(config), // JavaScript object -> JSON string
      dataType: "json",
      timeout: 8000,
      success: function (response) {
        setMsg($msg, response.message + ". Design #" + response.configuration.id + " saved in " +
          (response.storage === "mysql" ? "MySQL" : "memory") + ", " + money(response.configuration.price) + ".", "ok");
        checkServer();
        $("#loadSaved").trigger("click");
      },
      error: function (jqXHR, textStatus) {
        setMsg($msg, errorText(jqXHR, textStatus, "the backend"), "err");
      },
    });
  });

  // ---------- Initial paint ----------
  applyBottleScale();
  applyPreview();
  renderCart();
  checkServer();
  $("#loadCatalog").trigger("click");
  $(window).trigger("scroll"); // run reveal check
});
