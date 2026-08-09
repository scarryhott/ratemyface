export default function Privacy() {
  return (
    <main>
      <h1>Privacy Policy</h1>
      <p>Last updated: August 9, 2026.</p>

      <h2>What this service does</h2>
      <p>
        Rate My Face provides a backend used by the Rate My Face GPT to request relevant Amazon product recommendations.
      </p>

      <h2>Data processed</h2>
      <p>
        The product API is designed to receive only recommendation criteria such as product type, concern, optional brand,
        optional budget, and region. The backend does not require a name, email address, account identifier, or the user's
        uploaded image. Image analysis occurs in ChatGPT; the image is not intentionally transmitted to this backend.
      </p>

      <h2>Amazon</h2>
      <p>
        Product-search criteria are sent to Amazon Creators API to retrieve product information and Amazon-vended affiliate
        links. Purchases made through qualifying links may generate an advertising fee for the operator of Rate My Face.
      </p>

      <h2>Hosting and logs</h2>
      <p>
        This service is hosted on Vercel. Standard infrastructure metadata may be processed by the hosting provider for
        security, reliability, and operational logging. The application does not intentionally persist product-request
        payloads in its own database.
      </p>

      <h2>Security</h2>
      <p>
        The product endpoint uses server-side credentials and action authentication. Amazon API credentials are not exposed
        to browser clients or included in GPT responses.
      </p>

      <h2>Changes</h2>
      <p>This policy may be updated as the service changes.</p>
    </main>
  );
}
