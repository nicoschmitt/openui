(function() {
    var global = {
        storage: {
            items: 350,
            pokemon: 250
        },
        snipping: false
    };
    window.global = global;

    global.config = window.configService.load();
    global.version = global.config.version;

    document.title += " - " + global.version;

    function confirmAndSendToServer(msg, callback) {
        if (!global.config.noConfirm) {
            vex.dialog.confirm({
                message: msg,
                callback: function(value) {
                    if(value) callback();
                }
            });
        } else {
            callback();
        }
    }

    $(function() {
        var sortBy = localStorage.getItem("sortPokemonBy") || "cp";
        $("#sortBy" + sortBy).addClass("active").siblings().removeClass("active");

        $("#pokemonLink").click( function() {
            if ($(".inventory").css("opacity") == "1" && $(".inventory .data .pokemon").length) {
                $(".inventory").removeClass("active");
            } else {
                global.ws.emit("pokemon_list");
            }
        });
        $("#eggsLink").click( function() {
            if ($(".inventory").css("opacity") == "1" && $(".inventory .data .eggs").length) {
                $(".inventory").removeClass("active");
            } else {
                global.ws.emit("eggs_list");
            }
        });
        $("#inventoryLink").click( function() {
            if ($(".inventory").css("opacity") == "1" && $(".inventory .data .items").length) {
                $(".inventory").removeClass("active");
            } else {
                global.ws.emit("inventory_list");
            }
        });

        $("#sortBypokemonId").click(() => global.map.displayPokemonList(null, "pokemonId"));
        $("#sortBycp").click(() => global.map.displayPokemonList(null, "cp"));
        $("#sortByiv").click(() => global.map.displayPokemonList(null, "iv"));

        $("#sortBypokemonId, #sortBycp, #sortByiv").click( function() {
            if(!$(this).hasClass("active")) {
                $(this).toggleClass("active").siblings().removeClass("active");
            }
        });

        $(".inventory .refresh").click(function() {
            console.log("Refresh");
            global.ws.emit(global.active + "_list");
        });

        $(".inventory .close").click(function() {
            $(this).parent().removeClass("active");
            $(".inventory .sort").hide();
        });

        $(".message .close").click(function() {
            $(this).parent().hide();
        });

        $(".close").click(() => { global.active = null });

        $("#recycleLink").click(() => {
            sessionStorage.setItem("available", false);
            window.location.reload();
        });

        $("#settingsLink").click(() => {
            global.map.saveContext();
            window.location = "config.html";
        });

        $(".inventory .data").on("click", "a.transferAction", function() {
            var transfer = $(this).parent();
            var pokemonId = transfer.data().pokemonId;
            var totalLeft = global.map.pokemonList.filter(pokemon => pokemon.pokemonId == pokemonId).length;
            confirmAndSendToServer(`Are you sure you want to transfer your ${inventoryService.getPokemonName(pokemonId)}? You currently have <strong>${totalLeft}</strong> left.`, () => {
                ga("send", "event", "transfer");
                global.ws.emit("transfer_pokemon", {
                    id: transfer.attr("id")
                });
                transfer.parent().fadeOut();
            });
        });

        $(".inventory .data").on("click", "a.evolveAction", function() {
            var evolve = $(this).parent();
            confirmAndSendToServer("Are you sure you want to evolve this Pokemon?", () => {
                ga("send", "event", "transfer");
                global.ws.emit("evolve_pokemon", {
                    id: evolve.attr("id")
                });
                evolve.parent().fadeOut();
            });
        });

        $(".player").on("pogo:player_update", () => {
            if (global.player) {
                var player = $(".player");
                player.find(".playername .value").text(global.user);
                player.find(".level .value").text(global.player.level);
                var percent = 100*(global.player.experience - global.player.prev_level_xp)/(global.player.next_level_xp - global.player.prev_level_xp);
                player.find(".progress .value").css("width", `${percent.toFixed(0)}%`);
                player.show();
            }
        });

        if (global.config.websocket) {
            // settings ok, let's go
            global.map = new Map("map");
            global.map.loadContext();
            startListenToSocket();
        } else {
            // no settings, first time run?
            window.location = "config.html";
        }
    });

}());
