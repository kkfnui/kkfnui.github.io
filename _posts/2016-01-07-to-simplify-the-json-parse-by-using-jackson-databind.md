---
layout: post
title: "使用Databind简化json解析工作"
author: "kkfnui"
date: 2016-01-07 00:36:21 +0800
tags:
- json
- 推荐系统
---

现在工作中与客户端之间的通信使用的是 `http` + `json`。 相比以前下载库使用自定义的二进制协议，在协议扩展性和可调试性都方便了很多。

## 遍历解析json
以前也接触过一些`cpp`的`json`库，如`jsoncpp`。一般解析json都是遍历树状数据结构，获取节点上的数据。前段时间也不小心撇到红1客户端解析json的代码，使用的就是这种方式。比如，解析下面这段字符串：

```
{
    "name": "test",
    "age": 18,
    "friends": [
        {
            "name": "ali",
            "age": 17
        },
        {
            "name": "bait",
            "age": 18
        }
    ]
}
```
通过遍历，并将数据统一保存在一个对象，是满费劲的。尤其层级一旦变深之后，代码嵌套的层级也会变多。解析代码的行数会显著增加。如下：

```
ObjectMapper mapper = new ObjectMapper();
JsonNode rootNode = mapper.readTree(data);

User user = new User();
String name = rootNode.get("name").asText();
Integer age = rootNode.get("age").asInt();
user.setName(name);
user.setAge(age);

JsonNode friends = rootNode.get("friends");
List<User.FriendsEntity> friendsEntityList = new LinkedList<User.FriendsEntity>();
for (int i = 0; i < friends.size(); i++) {
  JsonNode friend = friends.get(i);
  String n = friend.get("name").asText();
  Integer a = friend.get("age").asInt();
  User.FriendsEntity friendsEntity = new User.FriendsEntity();
  friendsEntity.setName(n);
  friendsEntity.setAge(a);
  friendsEntityList.add(friendsEntity);
}
user.setFriends(friendsEntityList);
```

以上代码，就单单解析数据就有28行代码。数据结构变得复杂之后，工作量就成倍的增加，也更容易出错。协议解析就是机械的体力活。

## 使用DataBind
非常幸运。在我接触到服务端的时候，协议的解析没有采用这种方式。服务端解析json采用了一种**工作效率**更高的方式，用jackson的`databind`功能。以上协议解析，只要一行就可以搞定：

```
User nUser = mapper.readValue(data, User.class);
```

服务端刚使用DataBind的之后会觉得失去一定的灵活性。


### 多返回字段处理

虽然协议定义的字段只有2个，但是对端在某些原因在不知情的情况下，多传递了字段。这个时候，解析是会抛出异常的。这个时候可以给`User`增加注解解决：

```
@JsonIgnoreProperties(ignoreUnknown = true)
class User{
//……
}
```


### 代码复用

一般同一套业务之间的协议都会有公共头，或者返回列表的数据类型不同。这个时候，不想为每一个接口单独再定义一个完整的类型。这个时候可以使用泛型，DataBind是支持泛型的。

```
@SuppressWarnings("unchecked")
public <T> T readValue(String content, JavaType valueType)
   throws IOException, JsonParseException, JsonMappingException
{
   return (T) _readMapAndClose(_jsonFactory.createParser(content), valueType);
} 
```
使用

```
T obj = mapper.readValue(json, mapper.getTypeFactory().constructParametricType(parametrized, parameterClasses));
```

DataBind还支持一些其他的功能，因为不一定有用，所以也没有研究。有一些官方文档可以参考：[Java Json - Jackson Introduction](http://www.studytrails.com/java/json/java-jackson-introduction.jsp)



