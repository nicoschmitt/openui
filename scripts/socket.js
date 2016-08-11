var inventory = window.inventoryService;

function setUserName(user) {
    if (!global.user) {
        global.user = user;
        document.title = `[${user}] ${document.title}`;
    }
}

function startTimers() {
    // Get Player Stats every 5 minutes
    window.setInterval(() => {
        if (global.connected) {
            global.ws.emit("player_stats");
        }
    }, 1000*60*5);

    // Update pokestop status every minutes
    window.setInterval(() => {
        if (global.connected) {
            global.map.updatePokestopsStatus();
        }
    }, 1000*60);
}

function startListenToSocket() {
    inventory.init(global.config.locale);
    console.log("Connecting to " + global.config.websocket);

    startTimers();

    var pkmSettings = localStorage.getItem("pokemonSettings");
    if (pkmSettings) {
        global.pokemonSettings = JSON.parse(pkmSettings);
    } else {
        global.pokemonSettings = {};
    }

    var socket = io.connect(global.config.websocket + "/event");
    global.ws = socket;

    socket.on('connect', () => {
        console.log("Connected to Bot");
        global.connected = true;
        $(".loading").text("Waiting to get GPS coordinates from Bot...");
    });
    socket.on('disconnect', function() {
        global.connected = false;
    });
    socket.on("bot_initialized", msg => {
        //if (Array.isArray(msg)) msg = msg.length > 0 ? msg[0] : {};
        if (msg.username) {
            console.log("Bot Ready.");
            console.log(msg);
            setUserName(msg.username);
            global.player = msg.player;
            if (global.player) {
                $(".player").trigger("pogo:player_update");
                ga("send", "event", "level", global.player.level);
            }
            if (msg.storage) {
                global.storage = {
                    pokemon: msg.storage.max_pokemon_storage,
                    items: msg.storage.max_item_storage
                }
            }
            global.map.addToPath({
                lat: msg.coordinates[0],
                lng: msg.coordinates[1]
            });
        }
        $(".toolbar div").show();
    });
    socket.on("player_stats", msg => {
        global.player = msg.player;
        $(".player").trigger("pogo:player_update");
    });
    socket.on('position', msg => {
        if (!global.snipping) {
            global.map.addToPath({
                lat: msg.coordinates[0],
                lng: msg.coordinates[1]
            });
        }
    });
    socket.on('pokestops', msg => {
        var forts = Array.from(msg.pokestops.filter(f => f.fort_type == 1), f => {
            return {
                id: f.fort_id,
                lat: f.latitude,
                lng: f.longitude,
                cooldown: parseInt(f.cooldown_timestamp_ms) || null,
                lureExpire: parseInt(f.lure_expires_timestamp_ms) || null
            }
        });
        global.map.addPokestops(forts);
    });
    socket.on('pokestop_visited', msg => {
        console.log("Pokestop Visited");
        global.map.addVisitedPokestop({
            id: msg.pokestop.fort_id,
            name: "",
            lat: msg.pokestop.latitude,
            lng: msg.pokestop.longitude,
            cooldown: parseInt(msg.pokestop.cooldown_timestamp_ms) || null,
            lureExpire: parseInt(msg.pokestop.lure_expires_timestamp_ms) || null,
            visited: true
        });
    });
    socket.on('pokemon_caught', msg => {
        console.log("Pokemon caught");
        console.log(msg);
        var pokemon = msg.pokemon;
        var pkm = {
            id: pokemon.pokemon_id,
            name: inventory.getPokemonName(pokemon.pokemon_id),
            cp: pokemon.combat_power,
            iv: (pokemon.potential * 100).toFixed(1),
            lvl: inventory.getPokemonLevel(pokemon)
        };
        if (msg.position) {
            pkm.lat = msg.position.latitude;
            pkm.lng = msg.position.longitude;
        }
        global.map.addCatch(pkm);
        pokemonToast(pkm, { ball: pokemon.pokeball });
    });
    socket.on("transfered_pokemon", msg => {
        //console.log(msg)
    });
    socket.on("pokemon_evolved", msg => {
        //console.log(msg);
        var info = {
            id: msg.evolution,
            name: inventory.getPokemonName(msg.evolution)
        };
        var from = inventory.getPokemonName(msg.pokemon.pokemon_id)
        pokemonToast(info, { title: `A ${from} Evolved` });
    });
    socket.on("inventory_list", msg => {
        var items = Array.from(Object.keys(msg.inventory).filter(k => k != "count"), item => {
            var itemid = parseInt(item);
            return {
                item_id: itemid,
                name: inventory.getItemName(itemid),
                count: msg.inventory[item]
            }
        });
        global.map.displayInventory(items);
    });
    socket.on("pokemon_list", msg => {
        console.log(msg);
        var pkm = Array.from(msg.pokemon, p => {
            var pkmInfo = global.pokemonSettings[p.pokemon_id - 1];
            return {
                id: p.unique_id,
                pokemonId: p.pokemon_id,
                inGym: p.deployed_fort_id != null,
                canEvolve: pkmInfo && pkmInfo.EvolutionIds.length > 0,
                cp: p.combat_power,
                iv: (p.potential * 100).toFixed(1),
                lvl: inventory.getPokemonLevel(p),
                name: p.nickname || inventory.getPokemonName(p.pokemon_id),
                candy: msg.candy[p.pokemon_id] || 0,
                candyToEvolve: pkmInfo ? pkmInfo.CandyToEvolve : 0,
                favorite: p.favorite != 0,
                atk: p.attack,
                def: p.defense,
                hp: p.hp,
                maxHp: p.max_hp,
                sta: p.stamina
            }
        });
        global.map.displayPokemonList(pkm, null, msg.eggs_count);
    });
    socket.on("eggs_list", msg => {
        var incubators = msg.egg_incubators.filter(i => i.target_km_walked != 0 || i.start_km_walked != 0);
         incubators = Array.from(incubators, i => {
            msg.km_walked = msg.km_walked || 0;
            return {
                type: i.item_id == 901 ? "incubator-unlimited" : "incubator",
                totalDist: i.target_km_walked - i.start_km_walked,
                doneDist: msg.km_walked - i.start_km_walked
            }
        });
        var eggsInIncub = Array.from(msg.egg_incubators, i => i.pokemon_id);
        var eggs = Array.from(msg.eggs.filter(e => eggsInIncub.indexOf(e.unique_id) < 0), i => {
            return {
                type: "egg",
                totalDist: i.total_distance,
                doneDist: i.walked_distance
            }
        });
        global.map.displayEggsList(incubators.concat(eggs));
    });
    socket.on('pokemon_found', msg => {
        console.log(msg);
    });
    socket.on('player_update', msg => {
        console.log(msg);
    });
}

function notimplementedyet() {
    var ws = null;
    ws.onmessage = function (evt) {
        var msg = JSON.parse(evt.data);
        var command = msg.Command || msg.$type;
        if (command.indexOf("PokemonSettings") >= 0) {
            var settings = msg.Data.$values;
            global.pokemonSettings = Array.from(msg.Data.$values, elt => {
                elt.EvolutionIds = elt.EvolutionIds.$values;
                return elt;
            })
            localStorage.setItem("pokemonSettings", JSON.stringify(global.pokemonSettings));
        }
    };
}

function errorToast(message) {
    toastr.error(message, "Error", {
        "progressBar": true,
        "positionClass": "toast-top-right",
        "timeOut": "5000",
        "closeButton": true
    });
}

function pokemonToast(pkm, options) {
    if (global.config.noPopup) return;

    options = options || {};
    var title = options.title || ( global.snipping ? "Snipe success" : "Catch success" );
    var toast = global.snipping ? toastr.success : toastr.info;
    var pkminfo = pkm.name;
    if (pkm.lvl) pkminfo += ` (lvl ${pkm.lvl})`;

    var content = `<div>${pkminfo}</div><div>`;
    content += `<img src='./assets/pokemon/${pkm.id}.png' height='50' />`;
    if (options.ball) content += `<img src='./assets/inventory/${options.ball}.png' height='30' />`;
    content += `</div>`;
    toast(content, title, {
        "progressBar": true,
        "positionClass": "toast-top-right",
        "timeOut": "5000",
        "closeButton": true
    })
}
