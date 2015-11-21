---
layout: post
title: "Java ArrayList IndexOutOfBoundsException"
author: "kkfnui"
date: 2015-11-2 11:24:34 +0800
tags:
- java
---

I use cpp for a long time. Now I change to java language. Last day I wrote some code like 

```
ArrayList<Integer> arr = new ArrayList<Integer>(10);
arr.set(0, 1);
```

But it turns out to be expection:

```
Exception in thread "main" java.lang.IndexOutOfBoundsException: Index: 0, Size: 0
    at java.util.ArrayList.rangeCheck(Unknown Source)
    at java.util.ArrayList.set(Unknown Source)
    at HelloWorld.main(HelloWorld.java:13)
```

Yes, It's illage useage in java. Let's look the source code.

**Construct**

```
public ArrayList(int initialCapacity) 
{
     super();

     if (initialCapacity < 0)
          throw new IllegalArgumentException("Illegal Capacity: "+ initialCapacity);
     this.elementData = new Object[initialCapacity];
}
```
**And the set func**

```
public E set(int index, E element) 
{
     rangeCheck(index);  
     E oldValue = elementData(index);
     elementData[index] = element;
     return oldValue;
}

private void rangeCheck(int index) 
{
    if (index >= size) {
         throw new IndexOutOfBoundsException(outOfBoundsMsg(index));
    }
}

```

It seems that there exists two concept in arrry list -- size, cappacity. In the position of cpp programmer, the design is stupid and beyond imagination. The fact that no one is stupid but you don't understand them.


Then the offical comment is :

	This is a common design(it's the same in python too): `set` methods do not increase the size of a sequence/collection. If you want to increase the size then you want to `add` something.
	
Yet, I can't understand why alloced memory forbid access. 

What's the advantage. The design force user must do assignment before any useage. Then will avoid the problem of get uninitialzed value.

It's seems that set function will initial value, and should not be the problem. It's not "perfect", but it simple to implement.

**Solution**

```
ArrayList<Integer> arr = new ArrayList<Integer>(Collections.nCopies(10, 0));

```

