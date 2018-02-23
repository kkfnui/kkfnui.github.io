---
title: go get 支持私服的 gitlab
tags: golang gitlab
---

[原文](https://www.szyhf.org/2017/07/12/%E5%BD%93go-get%E9%81%87%E4%B8%8Agitlab/)


## 前言
go get命令可以说是golang开发者最常用的命令了，通过它我们可以轻松获得各种开源仓库中的包，并且比较方便的在不同的开发机快速部署开发环境。

> 此处应有版本依赖的问题，但听说新版的go会处理。

但作为企业行为，不是所有的代码包都适合放在公开的网站上，而开源的又适用于中小型企业的自建git仓库工具中，gitlab无疑是耀眼的一个，如果配合docker，一键部署简直不要太舒服。

<!--more-->

## 自建仓库的go get

其实golang在设计的时候是可以支持go get获取自建仓库的，详细原理网上很多，不罗嗦，简单讲，当执行go get your-web.com/your-project的时候，go其实会提交一个HTTP GET 到网址https://you-web.com/your-project?go-get=1，此时如果这个网址能在head的meta标签中返回以下格式的内容时，就可以告诉go客户端应该再到哪里获取仓库。

> 注意，默认情况下go会且仅会从https的网址获取数据！

```
<html>
    <head>
        <meta content="szyhf/go-dicache git https://github.com/szyhf/go-dicache" name="go-import">
    </head>
</html>
```


其中meta标签中的name是必填项，内容必须是go-import，而contat的格式为导入路径 VCS类型 仓库路径，例如，上述代码的含义就是从https://github.com/szyhf/go-dicache下载git仓库并放到导入路径为szyhf/go-dicache的$GOPATH中。

> 至于域名怎么能访问，怎么输出这个meta，相信对于各位童鞋来说肯定是不是什么problem，跳过

更多说明可以看这里go get命令

## 遇上gitlab

那么对于自建仓库的gitlab，应该怎么实现这个功能呢？其实gitlab很早就支持了go get，例如你的gitlab网站部署在gitlab.hello.com，你要get的项目是gitlab.hello.com/foo/bar，那么直接执行go get gitlab.hello.com/foo/bar就可以了，gitlab会自动在返回的网页中设置合适的meta标签的。

但实际使用的时候，我们知道，很多时候我们之所以用自建的gitlab，是因为这个仓库见不得光，说白了，我们自己git clone的时候还需要输入一下密码，go get显然也绕不过这个问题。

而默认情况下，gitlab返回的meta标签中的url是https类型的，而实际上更多时候，我们都是通过ssh的方式实现获取仓库，因此，我们需要对gitlab做一定的改造。

当前笔者使用的gitlab版本是9.3.6，对go get的支持是用过ruby-rails中的Middleware的方式实现的，很传统，如果懂ruby的话可以试试直接改，文件是gitlab/embedded/service/gitlab-rails/lib/gitlab/middleware/go.rb，此处不多说。

> 主要考虑要改源代码不是很优雅，特别是要处理gitlab的升级的时候。

此处给一个不需要懂ruby的非侵入式方案，因为公司的gitlab是搭配nginx使用的，所以在处理对gitlab的请求的时候，加入以下配置，可以达到一样的效果：

```
if ($http_user_agent ~* "go") {
    return 200 "<!DOCTYPE html><head><meta content='$host$uri git ssh://git@$host:$uri.git' name='go-import'></head></html>";
}
```

简单解释一下，来自go get的HTTP请求中，User Agent都是以go作为开头的，而且go也不会跟现在任何主流浏览器冲突，所以当发现$http_user_agent以go开头的时候，直接返回一个固定的字符串，字符串中注意仓库路径的拼接要加上ssh://，要不go1.8以下的版本无法识别。

> 上述是我第一次的方案，go get gitlab.hello.com/foo/bar成功，顺利按照预期工作。

然后工作了一阵子之后忽然又出现了新的问题，subpackage。

原因很简单，当我们在go get某个项目时，如果这个项目依赖于gitlab.hello.com/foo/bar/you/hu包，那么go get实际提交的请求会变成https://gitlab.hello.com/foo/bar/you/hu，而实际上并不存在这个仓库，如果按方案1的实现逻辑，会尝试下载git@gitlab.hello.com/foo/bar/you/hu.git。

很遗憾，这个仓库并不存在，真正存在的是gitlab.hello.com/foo/bar.git，那么应该怎么处理呢？结合nginx的正则表达式重定位的功能，更新的配置如下：

```
location ~* ^/[^/]+/[^/]+$ {
    if ($http_user_agent ~* '^go.*') {
        return 200 "<!DOCTYPE html><head><meta content='$host$uri git ssh://git@$host:$uri.git' name='go-import'></head></html>";
    }
    proxy_cache off;
    proxy_pass http://gitlab-workhorse;
}
location ~* ^/(?<holder>[^/]+)/(?<project>[^/]+)/.*$ {
    set $goRedirect 'https://$host/$holder/$project?$args';
    if ($http_user_agent ~* '^go.*') {
        return 301 $goRedirect;
    }
    proxy_cache off;
    proxy_pass http://gitlab-workhorse;
}
```

其中proxy_cache off;、proxy_pass http://gitlab-workhorse;是gitlab官方文档中给出的设置。

其实很容易理解。

主要来解释一下两个location，首先：

~*表示开始不区分大小写地匹配后边给出的正则。

正则^/[^/]+/[^/]+$是为了匹配形如/foo/bar的路径结构，如果匹配成功，继续检查User-Agent，如果符合go，则按第一个方案返回结果，如果不符合，则按一般的gitlab请求进行处理。

正则^/(?<holder>[^/]+)/(?<project>[^/]+)/.*$是为了匹配形如/foo/bar/you/hu/hu的结构，其中的小括号表示对其第一二个斜杠之间的字符串进行捕捉，并赋值给变量$holder、$project，然后判定User-Agent，如果符合go，则将请求重定位给/foo/bar，也就会再交给第一个正则处理，最后获得一致的结果。

显然第二个方案比第一个方案复杂了不少，但也都是很标准的nginx配置逻辑，未必优雅，但还是很实用的。

> 一般来说小型企业的代码库并不会有很高的访问频率，哪怕proxy稍微慢一点，影响也不大。

## Docker
如果使用docker版并使用了docker-compose，配置文件中的选项可以参考如下：

```
environment:
    GITLAB_OMNIBUS_CONFIG: |
        nginx['custom_gitlab_server_config'] = "location ~* ^/[^/]+/[^/]+$$ {\n    if ($$http_user_agent ~* '^go.*') {\n        return 200 \"<!DOCTYPE html><html><head><meta content='$$host$$uri git ssh://git@$$host:$$uri.git' name='go-import'></head></html>\";\n    }\n  proxy_cache off;\n    proxy_pass http://gitlab-workhorse;\n}\nlocation ~* ^/(?<holder>[^/]+)/(?<project>[^/]+)/.*$$ {\n    set $$goRedirect 'https://$$host/$$holder/$$project?$$args';\n    if ($$http_user_agent ~* '^go.*') {\n        return 301 $$goRedirect;\n  }\n  proxy_cache off;\n    proxy_pass http://gitlab-workhorse;\n}"
使用\$\$可以防止参数被当成环境变量使用。
```

## 总结

引用上文的方案，是我最开始看到的方案。
开始觉得需要配置 nginx 是个麻烦事情，所以就放弃了。

中间折腾了一些其他的方案，但是最终失败了：

1. 使用 git 的 insteadOf
    git config --global url."git@code.xbonline.net:".insteadOf "http://192.168.0.3:8800"
2. 折腾 letsencrypt
    踩了大坑，最后由于是 gitlab 是在局域网中，也没有成功的部署
