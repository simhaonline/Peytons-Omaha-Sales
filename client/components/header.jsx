import React from 'react';

export default function Header(props) {

  function getItems() {
    if (props.cart === 1) {
      return 'item';
    } else {
      return 'items';
    }
  }

  function handleClickToCart() {
    props.onClick('cart', {});
  }

  function handleClickToHome() {
    props.onClick('catalog', {});
  }

  return (
    <div className=" paddingTop navbar navbar-light  bg-dark">
      <div onClick={handleClickToHome} className="pointer ml-5">
        <div className="d-inline"><i className="text-white fas fa-dollar-sign "></i></div>
        <div className="ml-1 d-inline text-white">{props.name}</div>
      </div>
      <div onClick={handleClickToCart} className="pointer mr-4">
        <div className="d-inline text-white"><i className="fas fa-shopping-cart mr-2"></i></div>
        <div className="d-inline text-white mr-3">{props.cart} {getItems()}</div>
      </div>
    </div>
  );
}
