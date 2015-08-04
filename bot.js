/**
 * A Twitter bot for seeing the skew of MAU among an account's followers
 */



 var Twitter = require('twitter'),
     _ = require('underscore');

 var getFollowerIDs = function(params, options, callback) {

     options.client.get('/followers/ids', params, function(err, response) {

         if(err) return callback(err);

         var followerIDs = response.ids; // this is an array of followers...

         var nextCursorString = response.next_cursor_str;

         callback(null, { nextCursorString: nextCursorString, idSet: followerIDs });

     });

 };

 var saturateFollowersFromIDs = function(params, options, callback) {

     options.client.post('/users/lookup', params, function(err, users) {

         if(err) return callback(err);

         callback(null, { users: users });

     });

 };

 var getHeuristics = function(user) {

     var isActive,
         days;

     if(user.status) {
         var lastTweetDate = new Date(user.status.created_at);

         var diffMS = new Date() - lastTweetDate;
         days = Math.floor(diffMS / 3600000 / 24);

         if(days <= 30) isActive = true;

     }

     // MAU, DAU,
     return {
         lastTweetDaysAgo: days,
         isMonthlyActive: isActive,
         lowTweetCount: user.statuses_count < 10,
         lowFavoriteCount: user.favourites_count < 5,
         lowFollowingCount: user.friends_count < 10,
         highFollowingToFollowerCount: (user.friends_count / user.followers_count) > 5 && user.friends_count > 500 ? true : false,
         highFollowingCount: user.friends_count > 4000
     }

 };

 var isQualityUser = function(user) {

     var heuristics = getHeuristics(user);

     return !(heuristics.highFollowingToFollowerCount
         || heuristics.lowTweetCount
         || heuristics.lowFavoriteCount
         || heuristics.highFollowingCount
         || heuristics.lowFollowingCount
         || (heuristics.lastTweetDaysAgo > 7));

 };

 var isMonthlyActive = function(user) {

     var heuristics = getHeuristics(user);

     return heuristics.isMonthlyActive;

 };

 var processUsers = function(userSet, options) {
     _.each(userSet, function(user) {

         if(isMonthlyActive(user)) {

             if(isQualityUser(user)) options.monthlyActiveQuality++;


             options.monthlyActive++;

         }

         else {

             options.monthlyInactive++;


         }

     });
 };


 /**
  * Given a full followerIDs list, get info on all those tweeters...
  */
 crawlActiveFollowersFromIDs = function(idSet, options, callback) {

     if(idSet.length > 100) {

         // take the first 100 & update idSet to call it again...
         var subset = idSet.splice(0, 100);

         saturateFollowersFromIDs({ user_id: subset.join() }, options, function(err, response ) {

             if(err && err[0] && err[0].code == 88) {

                 console.log('Rate limit exceeded for user requests... sleeping for 1min and trying again...');

                 setTimeout(function() {

                     crawlActiveFollowersFromIDs(idSet, options, callback);

                 }, 60000);

             } else if(err) {

                 callback(err);

             } else {

                 processUsers(response.users, options);

                 crawlActiveFollowersFromIDs(idSet, options, callback);

             }

         });

     } else {

         saturateFollowersFromIDs({ user_id: idSet.join() }, options, function(err, response ) {

             if(err && err[0] && err[0].code == 88) {

                 console.log('Rate limit exceeded for user requests... sleeping for 1min and trying again...');

                 setTimeout(function() {

                     crawlActiveFollowersFromIDs(idSet, options, callback);

                 }, 60000);

             } else if(err) {

                 callback(err);

             } else {

                 processUsers(response.users, options);

                callback(null, options);


             }

         });


     }

 };

 var crawlFollowerIDs = function(params, options, callback) {

     getFollowerIDs(params, options, function(err, response) {

         if(err && err[0] && err[0].code == 88) {

             console.log('Rate limit exceeded for followers... sleeping for 1min and trying again...');

             setTimeout(function() {

                 crawlFollowerIDs(params, options, callback);

             }, 60000);

         } else if(err) {


             callback(err);
         }

         else if(response.nextCursorString != '0') {

             options.followerIDs = _.union(options.followerIDs, response.idSet);

             crawlFollowerIDs({ screen_name: options.twitterName, cursor: response.nextCursorString, stringify_ids: true  }, options, callback);

         }

         else {

            options.followerIDs = _.union(options.followerIDs, response.idSet);

            callback(null, options);

         }

     });

 };


module.exports = {

    getFollowerData: function(options, callback) {

        var twitterName = options.twitterScreenName;

        var client = new Twitter(options.twitterConfig);

        crawlFollowerIDs(
            {
                screen_name: twitterName,
                cursor: -1,
                stringify_ids: true
            },
            {
                client: client,
                twitterName: options.twitterScreenName,
                followerIDs: [],
            },
            function(err, result) {

                if(err) return callback(err, options);

                crawlActiveFollowersFromIDs(result.followerIDs,
                    {
                        client: client,
                        monthlyActive: 0,
                        monthlyInactive: 0,
                        monthlyActiveQuality: 0,

                    }, function(err, results) {
                        callback(err, options, results);
                    });

            }
        );


    }


};