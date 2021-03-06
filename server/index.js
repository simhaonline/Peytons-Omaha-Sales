require('dotenv/config');
const express = require('express');
const db = require('./database');
const ClientError = require('./client-error');
const staticMiddleware = require('./static-middleware');
const sessionMiddleware = require('./session-middleware');
const bcrypt = require('bcrypt');

const app = express();

app.use(staticMiddleware);
app.use(sessionMiddleware);

app.use(express.json());

app.get('/api/health-check', (req, res, next) => {
  db.query('select \'successfully connected\' as "message"')
    .then(result => res.json(result.rows[0]))
    .catch(err => next(err));
});

app.get('/api/products', (req, res, next) => {
  const sql = `
  select "productId",
          "name",
          "price",
          "image",
          "shortDescription"
  from "products"
  `;
  db.query(sql)
    .then(result => {
      res.status(200).json(result.rows);
    })
    .catch(err => next(err));
});

app.get('/api/products/:productId', (req, res, next) => {
  const sql = `
  select *
  from "products"
  where "productId" = $1
  `;
  const params = [req.params.productId];
  db.query(sql, params)
    .then(result => {
      if (!result.rows[0]) {
        throw new ClientError(`cannot ${req.method}/find the product number # ${req.params.productId} that you were searching for!`, 404);
      } else {
        res.status(200).json(result.rows[0]);
      }
    })
    .catch(err => next(err));
});

app.get('/api/cart', (req, res, next) => {
  if (!req.session.cartId) {
    res.status(200).json([]);
  }
  const sql = `
select "c"."cartItemId",
       "c"."price",
       "p"."productId",
       "p"."image",
       "p"."name",
       "p"."shortDescription"
  from "cartItems" as "c"
  join "products" as "p" using ("productId")
 where "c"."cartId" = $1
  `;
  const params = [req.session.cartId];
  db.query(sql, params)
    .then(result => {
      // console.log(result.rows);
      const resultArr = result.rows;
      const arrayOfItems = [];
      let arrayOfIds = [];
      let included = false;
      let quantity = 0;
      for (let i = 0; i < resultArr.length; i++) {
        for (let w = 0; w < resultArr.length; w++) {
          if (resultArr[i].productId === resultArr[w].productId) {
            quantity += 1;
            arrayOfIds.push(resultArr[w].cartItemId);
          }
        }
        for (let k = 0; k < arrayOfItems.length; k++) {
          if (resultArr[i].productId === arrayOfItems[k].productId) {
            included = true;
          }

        }
        if (!included) {
          arrayOfItems.push(resultArr[i]);
          const numberInArray = arrayOfItems.findIndex(item => item === resultArr[i]);
          arrayOfItems[numberInArray].quantity = quantity;
          arrayOfItems[numberInArray].ids = arrayOfIds;

        }
        included = false;
        quantity = 0;
        arrayOfIds = [];
      }
      res.status(200).json(arrayOfItems);
    })
    .catch(err => next(err));
});

app.post('/api/cart', (req, res, next) => {
  const numberId = parseInt(req.body.productId);
  if (isNaN(numberId) || numberId < 0) {
    throw new ClientError(`cannot ${req.body.productId} MUST be a positive Integer `, 400);
  } else {
    const sql = `
  select "price"
  from "products"
  where "productId" = $1
  `;
    const params = [numberId];
    db.query(sql, params)
      .then(result => {
        if (!result.rows[0]) {
          throw new ClientError(`cannot ${req.method}/find id number ${req.body.productId} that you were searching for!`, 400);
        }
        if (req.session.cartId) {
          return { cartId: req.session.cartId, price: result.rows[0].price };
        } else {
          const sql =
          `insert into "carts" ("cartId", "createdAt")
          values(default, default )
          returning "cartId"`;
          return db.query(sql)
            .then(secondResult => {
              return { cartId: secondResult.rows[0].cartId, price: result.rows[0].price };
            });
        }
      })
      .then(nextResult => {
        req.session.cartId = nextResult.cartId;
        const sql =
          `insert into "cartItems" ("cartId", "productId", "price")
              values ($1, $2, $3)
              returning "cartItemId"
              `;
        const params = [nextResult.cartId, numberId, nextResult.price];
        return db.query(sql, params);
      })
      .then(lastThenResult => {
        const sql = `select "c"."cartItemId",
          "c"."price",
          "p"."productId",
          "p"."image",
          "p"."name",
          "p"."shortDescription"
          from "cartItems" as "c"
          join "products" as "p" using ("productId")
          where "c"."cartItemId" = $1
        `;
        const params = [lastThenResult.rows[0].cartItemId];
        return db.query(sql, params)
          .then(result => {
            res.status(201).json(result.rows[0]);
          });
      })
      .catch(err => next(err));
  }
});

app.post('/api/orders', (req, res, next) => {
  if (!req.session.cartId) {
    throw new ClientError(`cannot ${req.method}/find a cart associated with your order`, 400);
  }
  if (!req.body.name || !req.body.creditCard || !req.body.shippingAddress) {
    throw new ClientError('Cannot complete your order because information was missing!', 404);
  }

  bcrypt.hash(req.body.creditCard, 10, function (err, hash) {
    console.error(err);
    const sql = `
  insert into "orders" ("cartId","name","creditCard", "shippingAddress")
  values ($1, $2, $3, $4)
  returning "createdAt","name","creditCard", "shippingAddress", "orderId"
  `;
    const params = [req.session.cartId, req.body.name, hash, req.body.shippingAddress];

    db.query(sql, params)
      .then(result => {
        delete req.session.cartId;
        res.status(201).json(result.rows[0]);
      })
      .catch(err => next(err));

  });

});

app.delete('/api/cart', (req, res, next) => {
  const numberId = parseInt(req.body.cartItemId);
  if (isNaN(numberId) || numberId < 0) {
    throw new ClientError(`cannot ${numberId} MUST be a positive Integer `, 400);
  } else {
    const sql = `
    Delete from "cartItems"
    where "cartItemId" = $1
    `;
    const params = [numberId];
    db.query(sql, params)
      .then(result => {
        if (result.rowCount !== 1) {
          throw new ClientError('cannot find item to delete in cart', 400);
        } else {
          res.status(204).json();
        }
      })
      .catch(err => next(err));
  }
});

app.use('/api', (req, res, next) => {
  next(new ClientError(`cannot ${req.method} ${req.originalUrl}`, 404));
});

app.use((err, req, res, next) => {
  if (err instanceof ClientError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error(err);
    res.status(500).json({
      error: 'an unexpected error occurred'
    });
  }
});

app.listen(process.env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log('Listening on port', process.env.PORT);
});
