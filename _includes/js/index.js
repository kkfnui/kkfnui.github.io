window.modules.index = function() {
    var ias = $.ias({
        container: '.posts',
        item: '.post',
        pagination: '.pager-next-url',
        next: '.pager-next-url'
    });
    ias.on('loaded', function(data, items) {
        console.log('loaded:', items);
        if (window.MathJax) MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
    });
    ias.extension(new IASSpinnerExtension({
        src: '/assets/img/loading.gif'
    }));
    ias.extension(new IASNoneLeftExtension({
        text: '只有这些了~',
        html: '<div class="ias-noneleft" style="text-align: center;">{text}</div>'
    }));

    $.get('/tags.json').done(function(tags) {
        var tagEls = tags
            .sort(function(lhs, rhs) {
                return rhs.count - lhs.count;
            })
            .map(function(tag) {
                return $('<a>', {
                    class: 'tag',
                    href: '/tags.html#' + tag.name
                }).html(tag.name + '(' + tag.count + ')');
            });
        $('.tag-list').append(tagEls);
    });
    var links = [{
        icon: ' fa-github-alt',
        background: '#000',
        url: 'https://github.com/kkfnui/',
        target: '_blank'
    }, {
        plugin: 'rss',
        url: 'http://blog.makerome.com/feed.xml',
        target: '_blank'
    }, {
        icon: 'fa-envelope',
        background: '#5484d6',
        url: 'mailto:kkfnui@126.com?subject=from blog.makerome.com'
    }, {
        plugin: 'qrcode',
        title: '扫一扫！'
    }];
    socialShare($('.follow').get(0), links, { size: 'sm' });
};