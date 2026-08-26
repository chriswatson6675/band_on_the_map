class AuditoriEventsArchive {
    constructor(data) {
        this.name = 'eventsarchive';
        this.data = data;
        this.container = jQuery('.a-events-container');
        this.sidebar_container = jQuery('.a-event-block');
        this.container_title = this.container.find("#a-container-title");

        this.searchbar = new AuditoriFilterSearch(this, '.a-searchbar');
        this.calendar = new AuditoriFilterCalendar(this, '.a-calendar');
        this.others = new AuditoriFilterOthers(this, 'others');
        this.last_rendered_index = 0;
        this.query_id = 0;

        this.limit = 30;
        this.months_loaded = {}
        this.lastDate = false;
        this.canBeLoaded = true;

        this.taxonomies = ['ecategory', 'etype', 'cicles', 'seasons']
        for (let i = 0; i < this.taxonomies.length; i++) {
            const taxonomy = this.taxonomies[i];
            this[taxonomy + '_filter'] = new AuditoriFilterTaxonomy(this, taxonomy);
        }

        this.init();
    }

    async init() {
        const self = this;

        await self.searchbar.init();
        await self.calendar.init();
        await self.others.init();

        jQuery(".calendar__day").each(function() {
            jQuery(this).attr("tabindex", -1)
        })

        for (let i = 0; i < self.taxonomies.length; i++) {
            const taxonomy = self.taxonomies[i];
            await self[taxonomy + '_filter'].init();
        }
    

        await self.filter(self);

        jQuery(window).off('scroll.archive_scroll');
        jQuery(window).on('scroll.archive_scroll', async function() {
            if (jQuery('.a-events-container').length == 0) return;
            const scroll = jQuery(window).scrollTop() + jQuery(window).height();
            let containerPosition = self.container.position().top + self.container.innerHeight();
            if (scroll > containerPosition && self.canBeLoaded) {
                self.canBeLoaded = false;
                self.query_id++;
                await self.update(self, self.query_id);
                containerPosition = self.container.position().top + self.container.innerHeight()
            }
        });

    }

    async update(self, query_id) {
        self.container.find('.a-loading').show();
        const needsUpdate = await self.query(self, query_id);
        if (needsUpdate) {
            await self.renderEvents(self);
            self.monthViewed(self, dayjs());

            container_query_smaller(
                ".a-auditori-card",
                700,
                "a-column",
                'a-responsive-archive-events-cards'
            );

            container_query_smaller(
                ".a-auditori-card-info",
                400,
                "a-column",
                'a-responsive-archive-events-infos'
            );

            self.container.find('.a-events-inner').removeClass('a-invisible');
            self.container.find('.a-loading').hide();
            self.container.find('.a-loading').removeClass('a-top-0');

        }
    }

    async filter(self) {
        self.query_id++;
        self.values = [];
        self.canBeLoaded = true;
        self.last_rendered_index = 0;
        self.lastDate = false;
        self.page = 1;
        const inner_container = self.container.find('.a-events-inner')

        if (Object.values(self.isFiltered()).some(value => value === true)) {
            self.container_title.text(window.translations["RESULTATS DE LA CERCA"]);
        } else {
            self.container_title.text(window.translations["PRÒXIMS ESDEVENIMENTS"]);
        }

        inner_container.empty();
        inner_container.addClass('a-invisible');
        self.container.find('.a-loading').addClass('a-top-0');

        await self.update(self, self.query_id);

        /*
        const newURL = this.generateURLFromFilters();
        window.history.pushState({path: newURL}, '', newURL);
    
        jQuery(window).trigger('auditori-url-changed');
        */
    }

    async renderEvents(self) {
        let cardOptions = {
            size: 'big',
            horizontal: true,
            action_click_everywhere: false,
            extraClassesExtraHeader: ['a-font-title', 'a-strong'],
            main_action_bottom: true
        }

        let html = '';
        while (self.last_rendered_index < self.values.length) {
            let current_event = self.values[self.last_rendered_index];

            if (self.last_rendered_index > 0) {
                html += '<hr class="a-mv-4 a-w-full a-hr-slim-dark">';
            }
            html += await renderHorizontalEventCard(current_event, cardOptions);
            self.last_rendered_index++;
        }

        if (self.last_rendered_index == 0) {
            html += `
                <div class="a-row a-pv-3 a-ph-4 a-align-center">
                    <div><span class="a-icon a-icon-question a-mr-4 a-h-8"></span> </div>
                    <div class="a-flex a-flex-1 a-no-p-margin a-strong">
                    ${window.translations["No s'ha trobat cap resultat"]}
                    </div>
                </div>`;
        }

        self.container.find('.a-events-inner').append(html);
    }

    async query(self, query_id) {
        let params = {
            page: self.page,
            limit: self.limit,
            output_profile: 'basic_card',
        }
        const searchbar_value = self.searchbar.getValue();
        if (searchbar_value) {
            params.s = searchbar_value;
        }

        const others_value = self.others.getValue();
        if (others_value) {
            params.others = others_value;
        }

        const tax_query = {};
        for (let i = 0; i < self.taxonomies.length; i++) {
            const taxonomy = self.taxonomies[i];
            const value = self[taxonomy + '_filter'].getValue();
            if (value.length > 0) {
                tax_query[taxonomy] = value;
            }
        }
        params.tax_query = tax_query;
        params.from_date = self.lastDate;

        const calendar_value = self.calendar.getValue();
        if (calendar_value) {
            params.session_in_date = {
                date_from: calendar_value.hour(0).unix(),
                date_to: calendar_value.hour(23).minute(59).unix(),
            }
        }

        if(this.isFiltered().calendar){
            params.hide_in_calendar = true;
        }
        if(this.isFiltered().tax_query){
            params.hide_in_filters = true;
        }
        params.hide_in_page = true;

        const new_values = await get_query('get_auditori_events_query', params);
        if (self.query_id != query_id) return false;

        let max_last_date = 0
        for(let i in new_values) {
            e = new_values[i].event_next_date
            if (e > max_last_date) {
                max_last_date = e;
            }
        }

        if (new_values.length > 0) {
            self.lastDate = max_last_date
        }

        if ((new_values.length < self.limit && !others_value) || (others_value && new_values.length == 0)) {
            self.canBeLoaded = false;
        } else {
            self.canBeLoaded = true;
        }

        self.values = self.values.concat(new_values);
        return true;

    }

    async monthViewed(self, date) {
        let month_year = date.year() + '-' + date.month();
        if (self.months_loaded[month_year]) {
            return;
        }
        self.months_loaded[month_year] = true;

        let params = {
            between_dates: {
                date_from: date.date(1).month(date.month() - 1).hour(0).minute(0).unix(),
                date_to: date.date(1).month(date.month() + 2).hour(0).minute(0).unix()
            }
        }

        params.hide_in_calendar = true;

        const new_values = await get_query('get_auditori_sessions_query', params);

        let calendar_events = [];
        for (let i = 0; i < new_values.length; i++) {
            const session = new_values[i];
            const e_date_formated = dayjs.unix(session.start_datetime).format('YYYY-MM-DDTHH:mm:ss');
            calendar_events.push({
                start: e_date_formated,
                end: e_date_formated,
            });
        }

        self.calendar.addEvents(calendar_events);
    }

    isFiltered() {
        const self = this;
        const searchbar_value = self.searchbar.getValue();

        const tax_query = {};
        for (let i = 0; i < self.taxonomies.length; i++) {
            const taxonomy = self.taxonomies[i];
            const value = self[taxonomy + '_filter'].getValue();
            if (value.length > 0) {
                tax_query[taxonomy] = value;
            }
        }

        const calendar_value = self.calendar.getValue();
        let calendar = {};
        if (calendar_value) {
            calendar = {
                date_from: calendar_value.hour(0).unix(),
                date_to: calendar_value.hour(23).minute(59).unix(),
            }
        }

        return {
            "searchbar_value" : searchbar_value !== "",
            "tax_query" : Object.keys(tax_query).length !== 0,
            "calendar" : Object.keys(calendar).length !== 0,
        }  
    }

    generateURLFromFilters() {
        let newURL = window.location.origin + window.location.pathname;
        const searchbar_value = this.searchbar.getValue();
    
        const params = [];
    
        if (searchbar_value) {
            params.push('search=' + encodeURIComponent(searchbar_value));
        }
    
        for (let i = 0; i < this.taxonomies.length; i++) {
            const taxonomy = this.taxonomies[i];
            const value = this[taxonomy + '_filter'].getValue();
            if (value.length > 0) {
                params.push(`s_${taxonomy}=${value.join(',')}`);
            }
        }
    
        const calendar_value = this.calendar.getValue();
        if (calendar_value) {
            params.push('date_from=' + calendar_value.hour(0).unix());
            params.push('date_to=' + calendar_value.hour(23).minute(59).unix());
        }
    
        if (params.length > 0) {
            newURL += '?' + params.join('&');
        }
    
        return newURL;
    }
    

}

function initAuditoriEventsBlock() {
    new AuditoriEventsArchive(aPeventsArchive);
}

window.initAuditoriEventsBlock = initAuditoriEventsBlock;