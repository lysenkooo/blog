var hrefs = [
  '//maxcdn.bootstrapcdn.com/font-awesome/4.3.0/css/font-awesome.min.css'
];

for (i in hrefs) {
  var link = document.createElement('link');
  link.setAttribute('rel', 'stylesheet');
  link.setAttribute('href', hrefs[i]);
  document.getElementsByTagName('head')[0].appendChild(link);
}